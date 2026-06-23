import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session.js";
import { query } from "../../db.js";
import { adminLog } from "../admin/service.js";
import { getSetting } from "../admin/settings.js";
import { backfillUsername, releaseUsername } from "./service.js";
import type { RowDataPacket } from "mysql2";

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  // Current user profile — available to all authenticated users including pending
  app.get("/api/me", async (req, reply) => {
    if (!req.sessionUser) {
      return reply.code(401).send({ error: { code: "error.unauthorized", message: "Not logged in" } });
    }
    const u = req.sessionUser!
    return reply.send({
      id: u.id,
      discordId: u.discordId,
      discordUsername: u.discordUsername,
      discordDisplayName: u.discordDisplayName,
      mcUsername: u.mcUsername,
      mcVerified: u.mcVerified,
      status: u.status,
      isAdmin: u.isAdmin,
      publicFactionTag: u.publicFactionTag,
    });
  });

  // Onboarding: set the mc_username for the FIRST time. Only works while the
  // user has no username yet — afterwards changes go through an admin-approved
  // request (see below). Username is stored case-sensitively.
  app.post<{ Body: { mcUsername: string } }>(
    "/api/me/onboard-username",
    { preHandler: requireAuth },
    async (req, reply) => {
      const mcUsername = (req.body?.mcUsername ?? "").trim();
      if (!mcUsername || mcUsername.length > 16 || !/^[A-Za-z0-9_]{1,16}$/.test(mcUsername)) {
        return reply.code(400).send({ error: { code: "error.invalidUsername", message: "Invalid username" } });
      }
      const userId = req.sessionUser!.id;
      // Guard against re-setting: only set if currently null.
      const [result] = await query<RowDataPacket[]>(
        "UPDATE users SET mc_username = ? WHERE id = ? AND mc_username IS NULL",
        [mcUsername, userId]
      );
      if ((result as any).affectedRows === 0) {
        return reply.code(409).send({ error: { code: "error.usernameAlreadySet", message: "Username already set" } });
      }
      await backfillUsername(mcUsername, userId);
      await adminLog(userId, "user.username_set", "user", userId, { mcUsername });
      return reply.send({ ok: true });
    }
  );

  // Get the caller's pending username-change request, if any.
  app.get("/api/me/username-change", { preHandler: requireAuth }, async (req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT id, requested_mc_username as requestedMcUsername, reason, status, created_at as createdAt
       FROM username_change_requests WHERE user_id = ? AND status = 'pending' LIMIT 1`,
      [req.sessionUser!.id]
    );
    return reply.send(rows[0] ?? null);
  });

  // Submit an mc_username change request (admin-approved). At most one pending.
  app.post<{ Body: { mcUsername: string; reason?: string } }>(
    "/api/me/username-change",
    { preHandler: requireAuth },
    async (req, reply) => {
      const mcUsername = (req.body?.mcUsername ?? "").trim();
      if (!mcUsername || mcUsername.length > 16 || !/^[A-Za-z0-9_]{1,16}$/.test(mcUsername)) {
        return reply.code(400).send({ error: { code: "error.invalidUsername", message: "Invalid username" } });
      }
      const userId = req.sessionUser!.id;
      if (!req.sessionUser!.mcUsername) {
        return reply.code(400).send({ error: { code: "error.invalidInput", message: "Set a username first via onboarding" } });
      }
      const [pending] = await query<RowDataPacket[]>(
        "SELECT id FROM username_change_requests WHERE user_id = ? AND status = 'pending'",
        [userId]
      );
      if (pending.length) {
        return reply.code(409).send({ error: { code: "error.changeRequestPending", message: "You already have a pending change request" } });
      }
      const [result] = await query<RowDataPacket[]>(
        "INSERT INTO username_change_requests (user_id, requested_mc_username, reason) VALUES (?, ?, ?)",
        [userId, mcUsername, req.body?.reason ?? ""]
      );
      const reqId = (result as any).insertId;
      await adminLog(userId, "user.username_change_request", "user", userId, { mcUsername });

      if (await getSetting("auto_approve_username_changes")) {
        await releaseUsername(userId);
        await query("UPDATE users SET mc_username = ?, mc_verified = FALSE WHERE id = ?", [mcUsername, userId]);
        await query(
          "UPDATE username_change_requests SET status = 'approved', resolved_at = NOW() WHERE id = ?",
          [reqId]
        );
        await adminLog(null, "user.username_change_approve", "user", userId, { mcUsername, auto: true });
        await backfillUsername(mcUsername, userId);
      }

      return reply.code(201).send({ id: reqId });
    }
  );

  // Cancel the caller's pending username-change request
  app.delete("/api/me/username-change", { preHandler: requireAuth }, async (req, reply) => {
    await query(
      "DELETE FROM username_change_requests WHERE user_id = ? AND status = 'pending'",
      [req.sessionUser!.id]
    );
    return reply.send({ ok: true });
  });

  // Permanently delete the caller's account.
  // Leaves a tombstone row (same id + discord_id, status='deleted', all personal
  // data wiped) so: the numeric id is never reused, admin_log entries remain
  // intact, and the same Discord account can re-register by updating the tombstone.
  app.delete("/api/me", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.sessionUser!.id;

    // Release player-note backfill link before wiping mc_username
    await releaseUsername(userId);

    // Wipe all user-owned data that is not kept for integrity / logs
    await query("DELETE FROM sessions WHERE user_id = ?", [userId]);
    await query("DELETE FROM global_notes WHERE user_id = ?", [userId]);
    await query("DELETE FROM player_notes WHERE author_id = ?", [userId]);
    await query("DELETE FROM tags WHERE owner_id = ?", [userId]);
    await query("DELETE FROM username_change_requests WHERE user_id = ?", [userId]);
    await query("DELETE FROM newspaper_subscriptions WHERE user_id = ?", [userId]);
    // Newspapers owned by the user: cascade deletes articles + reports via FK
    await query("DELETE FROM newspapers WHERE owner_id = ?", [userId]);
    await query("DELETE FROM reports WHERE reporter_id = ?", [userId]);

    // Convert the user row to a tombstone: preserve id + discord_id only
    await query(
      `UPDATE users SET
         discord_username = '',
         discord_display_name = '',
         mc_username = NULL,
         mc_verified = FALSE,
         status = 'deleted',
         is_admin = FALSE,
         public_faction_tag = NULL,
         last_report_at = NULL
       WHERE id = ?`,
      [userId]
    );

    await adminLog(userId, "user.delete_self", "user", userId);

    reply.clearCookie("session");
    return reply.send({ ok: true });
  });

  // Request verification
  app.post(
    "/api/me/verify-request",
    { preHandler: requireAuth },
    async (req, reply) => {
      // Stores a pending verification request in admin_log for the admin to act on
      await adminLog(req.sessionUser!.id, "user.verify_request", "user", req.sessionUser!.id);
      return reply.send({ ok: true });
    }
  );

  // Set/clear public faction tag
  app.patch<{ Body: { factionTag: string | null } }>(
    "/api/me/faction-tag",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { factionTag } = req.body;
      if (factionTag && factionTag.length > 40) {
        return reply.code(400).send({ error: { code: "error.tooLong", message: "Tag too long" } });
      }
      await query(
        "UPDATE users SET public_faction_tag = ? WHERE id = ?",
        [factionTag ?? null, req.sessionUser!.id]
      );
      return reply.send({ ok: true });
    }
  );

  // Search approved users (kept for backwards compat)
  app.get<{ Querystring: { q: string } }>(
    "/api/users/search",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { q } = req.query;
      if (!q || q.length < 1) return reply.send([]);
      const like = `%${q}%`;
      const [rows] = await query<RowDataPacket[]>(
        `SELECT id as userId, discord_username as discordUsername, discord_display_name as discordDisplayName,
                mc_username as mcUsername, mc_verified as mcVerified, public_faction_tag as publicFactionTag
         FROM users
         WHERE status = 'approved'
           AND (discord_username LIKE ? OR discord_display_name LIKE ? OR mc_username LIKE ?)
         LIMIT 20`,
        [like, like, like]
      );
      return reply.send(
        rows.map((r) => ({
          ...r,
          mcVerified: Boolean(r.mcVerified),
          avatarUrl: r.mcUsername ? `/api/avatars/${encodeURIComponent(r.mcUsername)}` : null,
        }))
      );
    }
  );

  // Full approved user list for client-side instant search (~1000 rows max)
  app.get(
    "/api/users/all",
    { preHandler: requireAuth },
    async (req, reply) => {
      const [rows] = await query<RowDataPacket[]>(
        `SELECT id as userId, discord_username as discordUsername, discord_display_name as discordDisplayName,
                mc_username as mcUsername, mc_verified as mcVerified, public_faction_tag as publicFactionTag
         FROM users WHERE status = 'approved' ORDER BY mc_username ASC`
      );
      reply.header("Cache-Control", "private, max-age=60");
      return reply.send(
        rows.map((r) => ({
          ...r,
          mcVerified: Boolean(r.mcVerified),
          avatarUrl: r.mcUsername ? `/api/avatars/${encodeURIComponent(r.mcUsername)}` : null,
        }))
      );
    }
  );
}
