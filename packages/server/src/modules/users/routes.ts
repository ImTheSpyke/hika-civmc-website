import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session.js";
import { query } from "../../db.js";
import { adminLog } from "../admin/service.js";
import { backfillUsername } from "./service.js";
import type { RowDataPacket } from "mysql2";

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  // Current user profile
  app.get("/api/me", { preHandler: requireAuth }, async (req, reply) => {
    const u = req.sessionUser!;
    return reply.send({
      id: u.id,
      discordUsername: u.discordUsername,
      discordDisplayName: u.discordDisplayName,
      mcUsername: u.mcUsername,
      mcVerified: u.mcVerified,
      status: u.status,
      isAdmin: u.isAdmin,
      publicFactionTag: u.publicFactionTag,
    });
  });

  // Set/change mc_username
  app.patch<{ Body: { mcUsername: string } }>(
    "/api/me/username",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { mcUsername } = req.body;
      if (!mcUsername || mcUsername.length > 16) {
        return reply.code(400).send({ error: { code: "error.invalidUsername", message: "Invalid username" } });
      }
      const userId = req.sessionUser!.id;
      await query(
        "UPDATE users SET mc_username = ?, mc_verified = FALSE WHERE id = ?",
        [mcUsername, userId]
      );
      await backfillUsername(mcUsername, userId);
      await adminLog(userId, "user.username_change", "user", userId, { mcUsername });
      return reply.send({ ok: true });
    }
  );

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

  // Search approved users
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
}
