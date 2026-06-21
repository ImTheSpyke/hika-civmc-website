import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session.js";
import { query } from "../../db.js";
import { adminLog } from "../admin/service.js";
import type { RowDataPacket } from "mysql2";

export async function newspapersRoutes(app: FastifyInstance): Promise<void> {
  // Public list of approved newspapers (no owner exposed)
  app.get("/api/newspapers", { preHandler: requireAuth }, async (_req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT id, name, description, created_at
       FROM newspapers WHERE status = 'approved' AND active = TRUE
       ORDER BY created_at DESC`
    );
    return reply.send(rows);
  });

  // Newspaper + its articles (no owner exposed)
  app.get<{ Params: { id: string } }>(
    "/api/newspapers/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      const [np] = await query<RowDataPacket[]>(
        "SELECT id, name, description, created_at FROM newspapers WHERE id = ? AND status = 'approved' AND active = TRUE",
        [id]
      );
      if (!np.length) return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      const [articles] = await query<RowDataPacket[]>(
        "SELECT id, title, body, published_at FROM articles WHERE newspaper_id = ? AND active = TRUE ORDER BY published_at DESC",
        [id]
      );
      return reply.send({ ...np[0], articles });
    }
  );

  // Request newspaper creation
  app.post<{ Body: { name: string; description: string; requestReason: string } }>(
    "/api/newspapers",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { name, description, requestReason } = req.body;
      if (!name || name.length > 80) {
        return reply.code(400).send({ error: { code: "error.invalidInput", message: "Invalid name" } });
      }
      const [result] = await query<RowDataPacket[]>(
        `INSERT INTO newspapers (owner_id, name, description, request_reason)
         VALUES (?, ?, ?, ?)`,
        [req.sessionUser!.id, name, description ?? "", requestReason ?? ""]
      );
      await adminLog(req.sessionUser!.id, "newspaper.request", "newspaper", (result as any).insertId);
      return reply.code(201).send({ id: (result as any).insertId });
    }
  );

  // My newspapers
  app.get("/api/me/newspapers", { preHandler: requireAuth }, async (req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      "SELECT id, name, description, status, created_at FROM newspapers WHERE owner_id = ? ORDER BY created_at DESC",
      [req.sessionUser!.id]
    );
    return reply.send(rows);
  });

  // Publish an article (owner only, newspaper must be approved)
  app.post<{ Params: { id: string }; Body: { title: string; body: string } }>(
    "/api/newspapers/:id/articles",
    { preHandler: requireAuth },
    async (req, reply) => {
      const newspaperId = parseInt(req.params.id, 10);
      const [np] = await query<RowDataPacket[]>(
        "SELECT id, owner_id, status FROM newspapers WHERE id = ?",
        [newspaperId]
      );
      if (!np.length) return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      if (np[0].owner_id !== req.sessionUser!.id) {
        return reply.code(403).send({ error: { code: "error.forbidden", message: "Not your newspaper" } });
      }
      if (np[0].status !== "approved") {
        return reply.code(403).send({ error: { code: "error.newspaper.notApproved", message: "Newspaper not approved" } });
      }
      const { title, body } = req.body;
      if (!title) return reply.code(400).send({ error: { code: "error.invalidInput", message: "Title required" } });
      const [result] = await query<RowDataPacket[]>(
        "INSERT INTO articles (newspaper_id, title, body) VALUES (?, ?, ?)",
        [newspaperId, title, body ?? ""]
      );
      await adminLog(req.sessionUser!.id, "article.publish", "article", (result as any).insertId);
      return reply.code(201).send({ id: (result as any).insertId });
    }
  );

  // Delete an article (owner or admin)
  app.delete<{ Params: { id: string; articleId: string } }>(
    "/api/newspapers/:id/articles/:articleId",
    { preHandler: requireAuth },
    async (req, reply) => {
      const newspaperId = parseInt(req.params.id, 10);
      const articleId = parseInt(req.params.articleId, 10);
      const [np] = await query<RowDataPacket[]>(
        "SELECT owner_id FROM newspapers WHERE id = ?",
        [newspaperId]
      );
      if (!np.length) return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      if (np[0].owner_id !== req.sessionUser!.id && !req.sessionUser!.isAdmin) {
        return reply.code(403).send({ error: { code: "error.forbidden", message: "Forbidden" } });
      }
      await query("DELETE FROM articles WHERE id = ? AND newspaper_id = ?", [articleId, newspaperId]);
      return reply.send({ ok: true });
    }
  );
}
