import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireOnboarded } from "../../auth/session.js";
import { query } from "../../db.js";
import { adminLog } from "../admin/service.js";
import { getSetting } from "../admin/settings.js";
import type { RowDataPacket } from "mysql2";

export async function newspapersRoutes(app: FastifyInstance): Promise<void> {
  // Public list of approved newspapers (active + archived, no owner exposed)
  app.get("/api/newspapers", { preHandler: requireOnboarded }, async (req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT id, name, description, active, archived, created_at
       FROM newspapers WHERE status = 'approved'
       ORDER BY created_at DESC`
    );
    const [reported] = await query<RowDataPacket[]>(
      "SELECT target_id FROM reports WHERE reporter_id = ? AND target_type = 'newspaper'",
      [req.sessionUser!.id]
    );
    const [subs] = await query<RowDataPacket[]>(
      "SELECT newspaper_id FROM newspaper_subscriptions WHERE user_id = ?",
      [req.sessionUser!.id]
    );
    const reportedSet = new Set(reported.map((r) => r.target_id as number));
    const subsSet = new Set(subs.map((s) => s.newspaper_id as number));
    return reply.send(rows.map((r) => ({
      ...r,
      active: Boolean(r.active),
      archived: Boolean(r.archived),
      reported: reportedSet.has(r.id as number),
      subscribed: subsSet.has(r.id as number),
    })));
  });

  // Newspaper + its articles. Owner sees their own (any state) for management;
  // admins may view hidden/archived newspapers (for moderation). Everyone else
  // only sees approved + active. Owner is never exposed in the public payload.
  app.get<{ Params: { id: string } }>(
    "/api/newspapers/:id",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      }
      const [npRows] = await query<RowDataPacket[]>(
        "SELECT id, owner_id, name, description, status, active, archived, created_at FROM newspapers WHERE id = ?",
        [id]
      );
      if (!npRows.length) {
        return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      }
      const np = npRows[0];
      const uid = req.sessionUser!.id;
      const isOwner = np.owner_id === uid;
      const isAdmin = req.sessionUser!.isAdmin;
      const publiclyVisible = np.status === "approved" && np.active;

      // 404 to anyone who isn't allowed to see a non-public newspaper.
      if (!publiclyVisible && !isOwner && !isAdmin) {
        return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      }

      // Owner/admin can see hidden articles too (so they can manage them).
      const canSeeHidden = isOwner || isAdmin;
      const [articles] = await query<RowDataPacket[]>(
        `SELECT id, title, body, active, published_at FROM articles
         WHERE newspaper_id = ? ${canSeeHidden ? "" : "AND active = TRUE"}
         ORDER BY published_at DESC`,
        [id]
      );

      // Which of these did the caller report?
      const [repNp] = await query<RowDataPacket[]>(
        "SELECT target_id FROM reports WHERE reporter_id = ? AND target_type = 'newspaper' AND target_id = ?",
        [uid, id]
      );
      const [repArticles] = await query<RowDataPacket[]>(
        "SELECT target_id FROM reports WHERE reporter_id = ? AND target_type = 'article'",
        [uid]
      );
      const reportedArticles = new Set(repArticles.map((r) => r.target_id as number));

      const [subRow] = await query<RowDataPacket[]>(
        "SELECT 1 FROM newspaper_subscriptions WHERE user_id = ? AND newspaper_id = ?",
        [uid, id]
      );

      return reply.send({
        id: np.id,
        name: np.name,
        description: np.description,
        created_at: np.created_at,
        active: Boolean(np.active),
        archived: Boolean(np.archived),
        status: np.status,
        mine: isOwner,
        reported: repNp.length > 0,
        subscribed: subRow.length > 0,
        articles: articles.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          active: Boolean(a.active),
          published_at: a.published_at,
          reported: reportedArticles.has(a.id as number),
        })),
      });
    }
  );

  // Request newspaper creation
  app.post<{ Body: { name: string; description: string; requestReason: string } }>(
    "/api/newspapers",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const { name, description, requestReason } = req.body;
      if (!name || name.length > 80) {
        return reply.code(400).send({ error: { code: "error.invalidInput", message: "Invalid name" } });
      }
      // Light anti-spam: one pending request at a time.
      const [pending] = await query<RowDataPacket[]>(
        "SELECT id FROM newspapers WHERE owner_id = ? AND status = 'pending'",
        [req.sessionUser!.id]
      );
      if (pending.length) {
        return reply.code(429).send({ error: { code: "error.rateLimited", message: "You already have a pending newspaper request" } });
      }
      const autoApprove = await getSetting("auto_approve_newspapers");
      const [result] = await query<RowDataPacket[]>(
        `INSERT INTO newspapers (owner_id, name, description, request_reason, status)
         VALUES (?, ?, ?, ?, ?)`,
        [req.sessionUser!.id, name, description ?? "", requestReason ?? "", autoApprove ? "approved" : "pending"]
      );
      const npId = (result as any).insertId;
      await adminLog(req.sessionUser!.id, autoApprove ? "newspaper.approve" : "newspaper.request", "newspaper", npId, autoApprove ? { auto: true } : undefined);
      return reply.code(201).send({ id: npId });
    }
  );

  // My newspapers
  app.get("/api/me/newspapers", { preHandler: requireOnboarded }, async (req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT id, name, description, status, active, archived, created_at
       FROM newspapers WHERE owner_id = ? ORDER BY created_at DESC`,
      [req.sessionUser!.id]
    );
    return reply.send(rows.map((r) => ({ ...r, active: Boolean(r.active), archived: Boolean(r.archived) })));
  });

  /** Load a newspaper and assert the caller owns it or is an admin. */
  async function loadManageable(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<RowDataPacket | null> {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      return null;
    }
    const [rows] = await query<RowDataPacket[]>(
      "SELECT id, owner_id, status, active, archived FROM newspapers WHERE id = ?",
      [id]
    );
    if (!rows.length) {
      reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      return null;
    }
    if (rows[0].owner_id !== req.sessionUser!.id && !req.sessionUser!.isAdmin) {
      reply.code(403).send({ error: { code: "error.forbidden", message: "Forbidden" } });
      return null;
    }
    return rows[0];
  }

  // Publish an article (owner or admin, newspaper approved & not archived)
  app.post<{ Params: { id: string }; Body: { title: string; body: string } }>(
    "/api/newspapers/:id/articles",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const np = await loadManageable(req, reply);
      if (!np) return;
      if (np.status !== "approved") {
        return reply.code(403).send({ error: { code: "error.newspaper.notApproved", message: "Newspaper not approved" } });
      }
      if (np.archived) {
        return reply.code(403).send({ error: { code: "error.newspaper.archived", message: "Newspaper is archived" } });
      }
      const { title, body } = req.body;
      if (!title || title.length > 200) {
        return reply.code(400).send({ error: { code: "error.invalidInput", message: "Title required (max 200)" } });
      }
      const [result] = await query<RowDataPacket[]>(
        "INSERT INTO articles (newspaper_id, title, body) VALUES (?, ?, ?)",
        [np.id, title, body ?? ""]
      );
      await adminLog(req.sessionUser!.id, "article.publish", "article", (result as any).insertId);
      return reply.code(201).send({ id: (result as any).insertId });
    }
  );

  // Hide / unhide an article (owner or admin)
  app.patch<{ Params: { id: string; articleId: string }; Body: { active: boolean } }>(
    "/api/newspapers/:id/articles/:articleId/active",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const np = await loadManageable(req, reply);
      if (!np) return;
      const articleId = parseInt(req.params.articleId, 10);
      const active = Boolean(req.body?.active);
      const [r] = await query<RowDataPacket[]>(
        "UPDATE articles SET active = ? WHERE id = ? AND newspaper_id = ?",
        [active, articleId, np.id]
      );
      if ((r as any).affectedRows === 0) {
        return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      }
      await adminLog(req.sessionUser!.id, active ? "article.unhide" : "article.hide", "article", articleId);
      return reply.send({ ok: true });
    }
  );

  // Delete an article (owner or admin)
  app.delete<{ Params: { id: string; articleId: string } }>(
    "/api/newspapers/:id/articles/:articleId",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const np = await loadManageable(req, reply);
      if (!np) return;
      const articleId = parseInt(req.params.articleId, 10);
      await query("DELETE FROM articles WHERE id = ? AND newspaper_id = ?", [articleId, np.id]);
      await adminLog(req.sessionUser!.id, "article.delete", "article", articleId);
      return reply.send({ ok: true });
    }
  );

  // Hide / unhide the newspaper itself (owner or admin)
  app.patch<{ Params: { id: string }; Body: { active: boolean } }>(
    "/api/newspapers/:id/active",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const np = await loadManageable(req, reply);
      if (!np) return;
      const active = Boolean(req.body?.active);
      await query("UPDATE newspapers SET active = ? WHERE id = ?", [active, np.id]);
      await adminLog(req.sessionUser!.id, active ? "newspaper.unhide" : "newspaper.hide", "newspaper", np.id as number);
      return reply.send({ ok: true });
    }
  );

  // Archive the newspaper (owner or admin). Archiving locks publishing. Lifting
  // an archive is super-admin only (see admin routes).
  app.post<{ Params: { id: string } }>(
    "/api/newspapers/:id/archive",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const np = await loadManageable(req, reply);
      if (!np) return;
      await query("UPDATE newspapers SET archived = TRUE WHERE id = ?", [np.id]);
      await adminLog(req.sessionUser!.id, "newspaper.archive", "newspaper", np.id as number);
      return reply.send({ ok: true });
    }
  );

  // Subscribe to a newspaper
  app.post<{ Params: { id: string } }>(
    "/api/newspapers/:id/subscribe",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      const [rows] = await query<RowDataPacket[]>(
        "SELECT id FROM newspapers WHERE id = ? AND status = 'approved'",
        [id]
      );
      if (!rows.length) return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      await query(
        "INSERT IGNORE INTO newspaper_subscriptions (user_id, newspaper_id) VALUES (?, ?)",
        [req.sessionUser!.id, id]
      );
      return reply.code(201).send({ ok: true });
    }
  );

  // Unsubscribe from a newspaper
  app.delete<{ Params: { id: string } }>(
    "/api/newspapers/:id/subscribe",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      await query(
        "DELETE FROM newspaper_subscriptions WHERE user_id = ? AND newspaper_id = ?",
        [req.sessionUser!.id, id]
      );
      return reply.send({ ok: true });
    }
  );

  // List subscribed newspapers
  app.get(
    "/api/me/subscriptions",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const [rows] = await query<RowDataPacket[]>(
        `SELECT n.id, n.name, n.description, n.active, n.archived, n.created_at
         FROM newspapers n
         JOIN newspaper_subscriptions s ON s.newspaper_id = n.id
         WHERE s.user_id = ? AND n.status = 'approved'
         ORDER BY s.created_at DESC`,
        [req.sessionUser!.id]
      );
      return reply.send(rows.map((r) => ({ ...r, active: Boolean(r.active), archived: Boolean(r.archived) })));
    }
  );
}
