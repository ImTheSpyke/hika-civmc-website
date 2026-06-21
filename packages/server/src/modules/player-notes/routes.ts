import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session.js";
import { query } from "../../db.js";
import type { RowDataPacket } from "mysql2";

export async function playerNotesRoutes(app: FastifyInstance): Promise<void> {
  // List all noted players for the current user
  app.get<{ Querystring: { tag?: string } }>(
    "/api/player-notes",
    { preHandler: requireAuth },
    async (req, reply) => {
      const authorId = req.sessionUser!.id;
      const { tag } = req.query;

      let sql = `
        SELECT pn.target_mc_username, pn.body, pn.updated_at,
               u.id as userId, u.discord_display_name, u.mc_verified, u.public_faction_tag
        FROM player_notes pn
        LEFT JOIN users u ON u.id = pn.target_user_id
        WHERE pn.author_id = ?`;
      const params: unknown[] = [authorId];

      if (tag) {
        sql += ` AND EXISTS (
          SELECT 1 FROM player_tags pt JOIN tags t ON t.id = pt.tag_id
          WHERE pt.target_mc_username = pn.target_mc_username COLLATE utf8mb4_bin
            AND t.owner_id = ? AND t.id = ?
        )`;
        params.push(authorId, tag);
      }

      sql += " ORDER BY pn.updated_at DESC";

      const [rows] = await query<RowDataPacket[]>(sql, params);
      return reply.send(
        rows.map((r) => ({
          mcUsername: r.target_mc_username,
          body: r.body,
          updatedAt: r.updated_at,
          resolvedUser: r.userId
            ? {
                id: r.userId,
                discordDisplayName: r.discord_display_name,
                mcVerified: Boolean(r.mc_verified),
                publicFactionTag: r.public_faction_tag,
                avatarUrl: `/api/avatars/${encodeURIComponent(r.target_mc_username as string)}`,
              }
            : null,
        }))
      );
    }
  );

  // Get a single note
  app.get<{ Params: { username: string } }>(
    "/api/player-notes/:username",
    { preHandler: requireAuth },
    async (req, reply) => {
      const [rows] = await query<RowDataPacket[]>(
        "SELECT body, updated_at FROM player_notes WHERE author_id = ? AND target_mc_username = ?",
        [req.sessionUser!.id, req.params.username]
      );
      if (!rows.length) return reply.code(404).send({ error: { code: "error.notFound", message: "Note not found" } });
      return reply.send(rows[0]);
    }
  );

  // Upsert a note
  app.put<{ Params: { username: string }; Body: { body: string } }>(
    "/api/player-notes/:username",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { username } = req.params;
      const { body } = req.body;
      const authorId = req.sessionUser!.id;

      // Resolve optional user id
      const [users] = await query<RowDataPacket[]>(
        "SELECT id FROM users WHERE mc_username = ? AND status = 'approved'",
        [username]
      );
      const targetUserId = users[0]?.id ?? null;

      await query(
        `INSERT INTO player_notes (author_id, target_mc_username, target_user_id, body)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE body = VALUES(body), target_user_id = VALUES(target_user_id), updated_at = NOW()`,
        [authorId, username, targetUserId, body]
      );
      return reply.send({ ok: true });
    }
  );

  // Delete a note
  app.delete<{ Params: { username: string } }>(
    "/api/player-notes/:username",
    { preHandler: requireAuth },
    async (req, reply) => {
      await query(
        "DELETE FROM player_notes WHERE author_id = ? AND target_mc_username = ?",
        [req.sessionUser!.id, req.params.username]
      );
      return reply.send({ ok: true });
    }
  );
}
