import type { FastifyInstance } from "fastify";
import { requireOnboarded } from "../../auth/session.js";
import { query } from "../../db.js";
import type { RowDataPacket } from "mysql2";

const MAX_CHARS = 5000;

export async function globalNotesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/global-notes", { preHandler: requireOnboarded }, async (req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      "SELECT body, updated_at FROM global_notes WHERE user_id = ?",
      [req.sessionUser!.id]
    );
    return reply.send(rows[0] ?? { body: "", updated_at: null });
  });

  app.put<{ Body: { body: string } }>(
    "/api/global-notes",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const { body } = req.body;
      if (typeof body !== "string") {
        return reply.code(400).send({ error: { code: "error.invalidInput", message: "body must be a string" } });
      }
      if (body.length > MAX_CHARS) {
        return reply.code(400).send({ error: { code: "error.tooLong", message: `Max ${MAX_CHARS} characters` } });
      }
      await query(
        `INSERT INTO global_notes (user_id, body) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE body = VALUES(body), updated_at = NOW()`,
        [req.sessionUser!.id, body]
      );
      return reply.send({ ok: true });
    }
  );
}
