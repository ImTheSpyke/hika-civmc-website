import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session.js";
import { query } from "../../db.js";
import { adminLog } from "../admin/service.js";
import type { RowDataPacket } from "mysql2";

const HIDE_THRESHOLD = 0.10;

export async function moderationRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { targetType: "newspaper" | "article" | "event"; targetId: number; reason?: string } }>(
    "/api/reports",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { targetType, targetId, reason } = req.body;

      if (!["newspaper", "article", "event"].includes(targetType)) {
        return reply.code(400).send({ error: { code: "error.invalidInput", message: "Invalid target type" } });
      }

      // System events are not reportable
      if (targetType === "event") {
        const [rows] = await query<RowDataPacket[]>(
          "SELECT is_system FROM events WHERE id = ?",
          [targetId]
        );
        if (rows[0]?.is_system) {
          return reply.code(400).send({ error: { code: "error.notReportable", message: "System events cannot be reported" } });
        }
      }

      // Insert (idempotent — duplicate is silently ignored)
      await query(
        `INSERT IGNORE INTO reports (reporter_id, target_type, target_id, reason)
         VALUES (?, ?, ?, ?)`,
        [req.sessionUser!.id, targetType, targetId, reason ?? null]
      );

      // Check auto-hide threshold
      const [[{ reporters }]] = await query<RowDataPacket[]>(
        "SELECT COUNT(DISTINCT reporter_id) as reporters FROM reports WHERE target_type = ? AND target_id = ?",
        [targetType, targetId]
      );
      const [[{ approvedUsers }]] = await query<RowDataPacket[]>(
        "SELECT COUNT(*) as approvedUsers FROM users WHERE status = 'approved'"
      );

      const ratio = approvedUsers > 0 ? reporters / approvedUsers : 0;

      if (ratio > HIDE_THRESHOLD) {
        // Only hide if not already reviewed for this report batch
        const [reviewed] = await query<RowDataPacket[]>(
          `SELECT id FROM moderation_reviews WHERE target_type = ? AND target_id = ?
           ORDER BY reviewed_at DESC LIMIT 1`,
          [targetType, targetId]
        );
        // Check if the item is currently visible
        const table = targetType === "newspaper" ? "newspapers" : targetType === "article" ? "articles" : "events";
        const [[item]] = await query<RowDataPacket[]>(
          `SELECT active FROM ${table} WHERE id = ?`,
          [targetId]
        );

        if (item?.active) {
          await query(`UPDATE ${table} SET active = FALSE WHERE id = ?`, [targetId]);
          await adminLog(null, "moderation.autohide", targetType, targetId, { reporters, approvedUsers });
        }
      }

      return reply.send({ ok: true });
    }
  );
}
