import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session.js";
import { query } from "../../db.js";
import type { RowDataPacket } from "mysql2";

const MAX_TAGS = 200;

function randomColor(): string {
  return "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
}

export async function tagsRoutes(app: FastifyInstance): Promise<void> {
  // List the user's tags
  app.get("/api/tags", { preHandler: requireAuth }, async (req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      "SELECT id, name, color FROM tags WHERE owner_id = ? ORDER BY name",
      [req.sessionUser!.id]
    );
    return reply.send(rows);
  });

  // Create a tag
  app.post<{ Body: { name: string; color?: string } }>(
    "/api/tags",
    { preHandler: requireAuth },
    async (req, reply) => {
      const ownerId = req.sessionUser!.id;
      const [[{ count }]] = await query<RowDataPacket[]>(
        "SELECT COUNT(*) as count FROM tags WHERE owner_id = ?",
        [ownerId]
      );
      if (count >= MAX_TAGS) {
        return reply.code(409).send({ error: { code: "error.tagLimit", message: "Tag limit reached" } });
      }
      const { name, color } = req.body;
      if (!name || name.length > 40) {
        return reply.code(400).send({ error: { code: "error.invalidInput", message: "Invalid name" } });
      }
      const [result] = await query<RowDataPacket[]>(
        "INSERT INTO tags (owner_id, name, color) VALUES (?, ?, ?)",
        [ownerId, name, color ?? randomColor()]
      );
      return reply.code(201).send({ id: (result as any).insertId });
    }
  );

  // Edit a tag
  app.patch<{ Params: { id: string }; Body: { name?: string; color?: string } }>(
    "/api/tags/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      const [rows] = await query<RowDataPacket[]>(
        "SELECT id FROM tags WHERE id = ? AND owner_id = ?",
        [id, req.sessionUser!.id]
      );
      if (!rows.length) return reply.code(404).send({ error: { code: "error.notFound", message: "Tag not found" } });
      const { name, color } = req.body;
      if (name) await query("UPDATE tags SET name = ? WHERE id = ?", [name, id]);
      if (color) await query("UPDATE tags SET color = ? WHERE id = ?", [color, id]);
      return reply.send({ ok: true });
    }
  );

  // Delete a tag and its assignments
  app.delete<{ Params: { id: string } }>(
    "/api/tags/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      await query(
        "DELETE FROM tags WHERE id = ? AND owner_id = ?",
        [req.params.id, req.sessionUser!.id]
      );
      return reply.send({ ok: true });
    }
  );

  // Assign a tag to a player
  app.post<{ Params: { id: string }; Body: { username: string } }>(
    "/api/tags/:id/assign",
    { preHandler: requireAuth },
    async (req, reply) => {
      const tagId = parseInt(req.params.id, 10);
      const [owned] = await query<RowDataPacket[]>(
        "SELECT id FROM tags WHERE id = ? AND owner_id = ?",
        [tagId, req.sessionUser!.id]
      );
      if (!owned.length) return reply.code(404).send({ error: { code: "error.notFound", message: "Tag not found" } });

      const { username } = req.body;
      const [users] = await query<RowDataPacket[]>(
        "SELECT id FROM users WHERE mc_username = ? AND status = 'approved'",
        [username]
      );
      const targetUserId = users[0]?.id ?? null;

      await query(
        `INSERT IGNORE INTO player_tags (tag_id, target_mc_username, target_user_id)
         VALUES (?, ?, ?)`,
        [tagId, username, targetUserId]
      );
      return reply.send({ ok: true });
    }
  );

  // Detach a tag from a player
  app.delete<{ Params: { id: string; username: string } }>(
    "/api/tags/:id/assign/:username",
    { preHandler: requireAuth },
    async (req, reply) => {
      const tagId = parseInt(req.params.id, 10);
      const [owned] = await query<RowDataPacket[]>(
        "SELECT id FROM tags WHERE id = ? AND owner_id = ?",
        [tagId, req.sessionUser!.id]
      );
      if (!owned.length) return reply.code(404).send({ error: { code: "error.notFound", message: "Tag not found" } });
      await query(
        "DELETE FROM player_tags WHERE tag_id = ? AND target_mc_username = ?",
        [tagId, req.params.username]
      );
      return reply.send({ ok: true });
    }
  );

  // Players carrying a tag
  app.get<{ Params: { id: string } }>(
    "/api/players/by-tag/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const tagId = parseInt(req.params.id, 10);
      const [owned] = await query<RowDataPacket[]>(
        "SELECT id FROM tags WHERE id = ? AND owner_id = ?",
        [tagId, req.sessionUser!.id]
      );
      if (!owned.length) return reply.code(404).send({ error: { code: "error.notFound", message: "Tag not found" } });
      const [rows] = await query<RowDataPacket[]>(
        `SELECT pt.target_mc_username, u.discord_display_name, u.mc_verified, u.public_faction_tag
         FROM player_tags pt
         LEFT JOIN users u ON u.id = pt.target_user_id
         WHERE pt.tag_id = ?`,
        [tagId]
      );
      return reply.send(rows);
    }
  );
}
