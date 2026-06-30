import type { FastifyInstance } from "fastify";
import { requireAdmin, requireAuth } from "../../auth/session.js";
import { query } from "../../db.js";
import { adminLog } from "./service.js";
import { getAllSettings, setSetting, type SettingKey } from "./settings.js";
import { backfillUsername, releaseUsername, rebackfillAll } from "../users/service.js";
import type { RowDataPacket } from "mysql2";

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // --- Stats ---
  app.get("/api/admin/stats", { preHandler: requireAdmin }, async (_req, reply) => {
    const [[{ registeredUsers }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as registeredUsers FROM users WHERE status = 'approved'"
    );
    const [[{ currentlyActive }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as currentlyActive FROM users WHERE last_seen_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE) AND status = 'approved'"
    );
    const [[{ avgActive1h }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(DISTINCT id) / 12 as avgActive1h FROM users WHERE last_seen_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) AND status = 'approved'"
    );
    const [[{ avgActive4h }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(DISTINCT id) / 48 as avgActive4h FROM users WHERE last_seen_at > DATE_SUB(NOW(), INTERVAL 4 HOUR) AND status = 'approved'"
    );
    const [[{ newspapers }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as newspapers FROM newspapers WHERE status = 'approved'"
    );
    const [[{ articlesTotal }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as articlesTotal FROM articles WHERE active = TRUE"
    );
    const [[{ articlesLast7d }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as articlesLast7d FROM articles WHERE active = TRUE AND published_at > DATE_SUB(NOW(), INTERVAL 7 DAY)"
    );
    const [[{ eventsUpcoming }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as eventsUpcoming FROM events WHERE status = 'approved' AND active = TRUE AND starts_at > NOW()"
    );
    const [[{ pendingAccounts }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as pendingAccounts FROM users WHERE status = 'pending'"
    );
    const [[{ pendingNewspapers }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as pendingNewspapers FROM newspapers WHERE status = 'pending'"
    );
    const [[{ pendingEvents }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as pendingEvents FROM events WHERE status = 'pending'"
    );
    const [[{ pendingUsernameChanges }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as pendingUsernameChanges FROM username_change_requests WHERE status = 'pending'"
    );
    const [[{ moderationReviews }]] = await query<RowDataPacket[]>(
      "SELECT COUNT(*) as moderationReviews FROM newspapers WHERE active = FALSE AND status = 'approved' UNION ALL SELECT COUNT(*) FROM articles WHERE active = FALSE UNION ALL SELECT COUNT(*) FROM events WHERE active = FALSE AND status = 'approved'"
    );

    return reply.send({
      registeredUsers,
      currentlyActive,
      avgActive1h,
      avgActive4h,
      newspapers,
      articlesPublished: { total: articlesTotal, last7d: articlesLast7d },
      eventsUpcoming,
      pending: {
        accounts: pendingAccounts,
        newspapers: pendingNewspapers,
        events: pendingEvents,
        usernameChanges: pendingUsernameChanges,
        moderationReviews,
      },
    });
  });

  // --- Admin log ---
  app.get<{
    Querystring: { action?: string; actor?: string; page?: string; limit?: string };
  }>("/api/admin/log", { preHandler: requireAdmin }, async (req, reply) => {
    const { action, actor, page, limit } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (action) { conditions.push("l.action = ?"); params.push(action); }
    if (actor) { conditions.push("l.actor_id = ?"); params.push(actor); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const lim = Math.min(parseInt(limit ?? "50", 10), 200);
    const offset = (Math.max(1, parseInt(page ?? "1", 10)) - 1) * lim;
    const [[{ total }]] = await query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM admin_log l ${where}`, params
    );
    const [rows] = await query<RowDataPacket[]>(
      `SELECT l.id, l.at, l.actor_id, u.discord_display_name as actor_name,
              l.action, l.target_type, l.target_id, l.meta
       FROM admin_log l LEFT JOIN users u ON u.id = l.actor_id
       ${where} ORDER BY l.at DESC LIMIT ? OFFSET ?`,
      [...params, lim, offset]
    );
    return reply.send({ total, page: parseInt(page ?? "1", 10), limit: lim, rows });
  });

  // --- User management ---
  app.get<{ Querystring: { status?: string } }>(
    "/api/admin/users",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { status } = req.query;
      const [rows] = await query<RowDataPacket[]>(
        `SELECT id, discord_id, discord_username, discord_display_name, mc_username,
                mc_verified, status, is_admin, public_faction_tag, created_at
         FROM users ${status ? "WHERE status = ?" : ""}
         ORDER BY created_at DESC`,
        status ? [status] : []
      );
      return reply.send(rows);
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/users/:id/approve",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const userId = parseInt(req.params.id, 10);
      await query("UPDATE users SET status = 'approved' WHERE id = ?", [userId]);
      const [rows] = await query<RowDataPacket[]>(
        "SELECT mc_username FROM users WHERE id = ?",
        [userId]
      );
      if (rows[0]?.mc_username) {
        await backfillUsername(rows[0].mc_username as string, userId);
      }
      await adminLog(req.sessionUser!.id, "user.approve", "user", userId);
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/users/:id/reject",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const userId = parseInt(req.params.id, 10);
      await query("UPDATE users SET status = 'rejected' WHERE id = ?", [userId]);
      await adminLog(req.sessionUser!.id, "user.reject", "user", userId);
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/users/:id/verify",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const userId = parseInt(req.params.id, 10);
      await query("UPDATE users SET mc_verified = TRUE WHERE id = ?", [userId]);
      await adminLog(req.sessionUser!.id, "user.verify", "user", userId);
      return reply.send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/users/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const userId = parseInt(req.params.id, 10);
      const [rows] = await query<RowDataPacket[]>(
        "SELECT mc_username FROM users WHERE id = ?",
        [userId]
      );
      if (rows[0]?.mc_username) {
        await releaseUsername(userId);
      }
      await query("DELETE FROM users WHERE id = ?", [userId]);
      await adminLog(req.sessionUser!.id, "user.delete", "user", userId);
      return reply.send({ ok: true });
    }
  );

  // --- Username change requests ---
  app.get("/api/admin/username-changes", { preHandler: requireAdmin }, async (_req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT r.id, r.user_id, r.requested_mc_username, r.reason, r.created_at,
              u.discord_display_name, u.mc_username as current_mc_username
       FROM username_change_requests r JOIN users u ON u.id = r.user_id
       WHERE r.status = 'pending' ORDER BY r.created_at ASC`
    );
    return reply.send(rows);
  });

  app.post<{ Params: { id: string } }>(
    "/api/admin/username-changes/:id/approve",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const reqId = parseInt(req.params.id, 10);
      const [rows] = await query<RowDataPacket[]>(
        "SELECT user_id, requested_mc_username FROM username_change_requests WHERE id = ? AND status = 'pending'",
        [reqId]
      );
      if (!rows.length) return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      const { user_id, requested_mc_username } = rows[0];
      // Release the old username link, set new name, re-link to the new name.
      await releaseUsername(user_id as number);
      await query("UPDATE users SET mc_username = ?, mc_verified = FALSE WHERE id = ?", [requested_mc_username, user_id]);
      await backfillUsername(requested_mc_username as string, user_id as number);
      await query(
        "UPDATE username_change_requests SET status = 'approved', resolved_at = NOW(), resolved_by = ? WHERE id = ?",
        [req.sessionUser!.id, reqId]
      );
      await adminLog(req.sessionUser!.id, "user.username_change_approve", "user", user_id as number, { mcUsername: requested_mc_username });
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/username-changes/:id/reject",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const reqId = parseInt(req.params.id, 10);
      const [r] = await query<RowDataPacket[]>(
        "UPDATE username_change_requests SET status = 'rejected', resolved_at = NOW(), resolved_by = ? WHERE id = ? AND status = 'pending'",
        [req.sessionUser!.id, reqId]
      );
      if ((r as any).affectedRows === 0) return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      await adminLog(req.sessionUser!.id, "user.username_change_reject", "user", reqId);
      return reply.send({ ok: true });
    }
  );

  // --- Newspaper management ---
  app.get<{ Querystring: { status?: string } }>(
    "/api/admin/newspapers",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { status } = req.query;
      const [rows] = await query<RowDataPacket[]>(
        `SELECT n.*, u.discord_display_name as owner_name
         FROM newspapers n JOIN users u ON u.id = n.owner_id
         ${status ? "WHERE n.status = ?" : ""}
         ORDER BY n.created_at DESC`,
        status ? [status] : []
      );
      return reply.send(rows);
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/newspapers/:id/approve",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      await query("UPDATE newspapers SET status = 'approved' WHERE id = ?", [id]);
      await adminLog(req.sessionUser!.id, "newspaper.approve", "newspaper", id);
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/newspapers/:id/reject",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      await query("UPDATE newspapers SET status = 'rejected' WHERE id = ?", [id]);
      await adminLog(req.sessionUser!.id, "newspaper.reject", "newspaper", id);
      return reply.send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/newspapers/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      await query("DELETE FROM newspapers WHERE id = ?", [id]);
      await adminLog(req.sessionUser!.id, "moderation.remove", "newspaper", id);
      return reply.send({ ok: true });
    }
  );

  // Lift an archive — super-admin only (owners cannot un-archive).
  app.post<{ Params: { id: string } }>(
    "/api/admin/newspapers/:id/unarchive",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      await query("UPDATE newspapers SET archived = FALSE WHERE id = ?", [id]);
      await adminLog(req.sessionUser!.id, "newspaper.unarchive", "newspaper", id);
      return reply.send({ ok: true });
    }
  );

  // --- Event management ---
  app.get<{ Querystring: { status?: string } }>(
    "/api/admin/events",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { status } = req.query;
      const [rows] = await query<RowDataPacket[]>(
        `SELECT e.*, u.discord_display_name as requester_name
         FROM events e LEFT JOIN users u ON u.id = e.requested_by
         ${status ? "WHERE e.status = ?" : ""}
         ORDER BY e.created_at DESC`,
        status ? [status] : []
      );
      return reply.send(rows);
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/events/:id/approve",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      await query("UPDATE events SET status = 'approved' WHERE id = ?", [id]);
      await adminLog(req.sessionUser!.id, "event.approve", "event", id);
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/events/:id/reject",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      await query("UPDATE events SET status = 'rejected' WHERE id = ?", [id]);
      await adminLog(req.sessionUser!.id, "event.reject", "event", id);
      return reply.send({ ok: true });
    }
  );

  // Create a system event (e.g. AI invasion)
  app.post<{
    Body: { name: string; description: string; startsAt: string; durationMinutes: number; x?: number; y?: number; z?: number; isSystem?: boolean };
  }>("/api/admin/events", { preHandler: requireAdmin }, async (req, reply) => {
    const { name, description, startsAt, durationMinutes, x, y, z, isSystem } = req.body;
    const [result] = await query<RowDataPacket[]>(
      `INSERT INTO events (requested_by, name, description, starts_at, duration_minutes, x, y, z, is_system, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
      [req.sessionUser!.id, name, description, startsAt, durationMinutes, x ?? null, y ?? null, z ?? null, isSystem ?? false]
    );
    return reply.code(201).send({ id: (result as any).insertId });
  });

  app.patch<{ Params: { id: string }; Body: Partial<{ name: string; description: string; startsAt: string; active: boolean }> }>(
    "/api/admin/events/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      const { name, description, startsAt, active } = req.body;
      if (name !== undefined) await query("UPDATE events SET name = ? WHERE id = ?", [name, id]);
      if (description !== undefined) await query("UPDATE events SET description = ? WHERE id = ?", [description, id]);
      if (startsAt !== undefined) await query("UPDATE events SET starts_at = ? WHERE id = ?", [startsAt, id]);
      if (active !== undefined) await query("UPDATE events SET active = ? WHERE id = ?", [active, id]);
      return reply.send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/events/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      await query("DELETE FROM events WHERE id = ?", [id]);
      await adminLog(req.sessionUser!.id, "moderation.remove", "event", id);
      return reply.send({ ok: true });
    }
  );

  // --- Manual re-backfill ---
  app.post("/api/admin/rebackfill", { preHandler: requireAdmin }, async (req, reply) => {
    await rebackfillAll();
    await adminLog(req.sessionUser!.id, "admin.rebackfill");
    return reply.send({ ok: true });
  });

  // --- Site settings ---
  app.get("/api/admin/settings", { preHandler: requireAdmin }, async (_req, reply) => {
    return reply.send(await getAllSettings());
  });

  app.patch<{ Body: Record<string, boolean> }>(
    "/api/admin/settings",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const allowed: SettingKey[] = ["auto_approve_accounts", "auto_approve_username_changes", "auto_approve_newspapers", "newspapers_enabled", "events_enabled"];
      for (const key of allowed) {
        if (typeof req.body[key] === "boolean") {
          await setSetting(key, req.body[key]);
          await adminLog(req.sessionUser!.id, "settings.update", undefined, undefined, { key, value: req.body[key] });
        }
      }
      return reply.send(await getAllSettings());
    }
  );

  // --- Moderation queue ---
  app.get("/api/admin/moderation", { preHandler: requireAdmin }, async (_req, reply) => {
    // `newspaperId` lets the admin UI build an "open page" link to the affected
    // newspaper (for both hidden newspapers and hidden articles within one).
    const [hidden] = await query<RowDataPacket[]>(
      `SELECT 'newspaper' as type, n.id, n.name as title, n.name as newspaper_name, n.id as newspaper_id, n.active
         FROM newspapers n WHERE n.active = FALSE AND n.status = 'approved'
       UNION ALL
       SELECT 'article', a.id, a.title, n.name as newspaper_name, n.id as newspaper_id, a.active
         FROM articles a JOIN newspapers n ON n.id = a.newspaper_id WHERE a.active = FALSE
       UNION ALL
       SELECT 'event', e.id, e.name as title, NULL as newspaper_name, NULL as newspaper_id, e.active
         FROM events e WHERE e.active = FALSE AND e.status = 'approved'`
    );
    return reply.send(hidden);
  });

  app.post<{ Params: { type: string; id: string } }>(
    "/api/admin/moderation/:type/:id/reinstate",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { type, id } = req.params;
      const table = type === "newspaper" ? "newspapers" : type === "article" ? "articles" : "events";
      await query(`UPDATE ${table} SET active = TRUE WHERE id = ?`, [id]);
      await query(
        "INSERT INTO moderation_reviews (target_type, target_id, decision, reviewed_by) VALUES (?, ?, 'reinstated', ?)",
        [type, id, req.sessionUser!.id]
      );
      await adminLog(req.sessionUser!.id, "moderation.reinstate", type, parseInt(id, 10));
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { type: string; id: string } }>(
    "/api/admin/moderation/:type/:id/remove",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { type, id } = req.params;
      const table = type === "newspaper" ? "newspapers" : type === "article" ? "articles" : "events";
      await query(`DELETE FROM ${table} WHERE id = ?`, [id]);
      await query(
        "INSERT INTO moderation_reviews (target_type, target_id, decision, reviewed_by) VALUES (?, ?, 'removed', ?)",
        [type, id, req.sessionUser!.id]
      );
      await adminLog(req.sessionUser!.id, "moderation.remove", type, parseInt(id, 10));
      return reply.send({ ok: true });
    }
  );
}
