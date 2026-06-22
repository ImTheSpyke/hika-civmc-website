import type { FastifyInstance } from "fastify";
import { requireOnboarded } from "../../auth/session.js";
import { query } from "../../db.js";
import { adminLog } from "../admin/service.js";
import type { RowDataPacket } from "mysql2";

const HIDE_THRESHOLD = 0.10;
const REPORT_COOLDOWN_MS = 15_000;
const VALID_TYPES = ["newspaper", "article", "event"] as const;
type TargetType = (typeof VALID_TYPES)[number];

function tableFor(type: TargetType): string {
  return type === "newspaper" ? "newspapers" : type === "article" ? "articles" : "events";
}

/** Auto-hide an item if the distinct-reporter ratio exceeds the threshold. */
async function maybeAutoHide(targetType: TargetType, targetId: number): Promise<void> {
  const [[{ reporters }]] = await query<RowDataPacket[]>(
    "SELECT COUNT(DISTINCT reporter_id) as reporters FROM reports WHERE target_type = ? AND target_id = ?",
    [targetType, targetId]
  );
  const [[{ approvedUsers }]] = await query<RowDataPacket[]>(
    "SELECT COUNT(*) as approvedUsers FROM users WHERE status = 'approved'"
  );
  const ratio = approvedUsers > 0 ? reporters / approvedUsers : 0;
  if (ratio <= HIDE_THRESHOLD) return;

  const table = tableFor(targetType);
  const [[item]] = await query<RowDataPacket[]>(
    `SELECT active FROM ${table} WHERE id = ?`,
    [targetId]
  );
  if (item?.active) {
    await query(`UPDATE ${table} SET active = FALSE WHERE id = ?`, [targetId]);
    await adminLog(null, "moderation.autohide", targetType, targetId, { reporters, approvedUsers });
  }
}

export async function moderationRoutes(app: FastifyInstance): Promise<void> {
  // Add a report. Toggle-on direction. Enforces a 15s cross-item cooldown
  // between *adding* reports (un-reporting is exempt — see DELETE below).
  app.post<{ Body: { targetType: TargetType; targetId: number; reason?: string } }>(
    "/api/reports",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const { targetType, targetId, reason } = req.body;
      const userId = req.sessionUser!.id;

      if (!VALID_TYPES.includes(targetType) || !Number.isInteger(targetId)) {
        return reply.code(400).send({ error: { code: "error.invalidInput", message: "Invalid target" } });
      }

      // System events are not reportable
      if (targetType === "event") {
        const [rows] = await query<RowDataPacket[]>("SELECT is_system FROM events WHERE id = ?", [targetId]);
        if (rows[0]?.is_system) {
          return reply.code(400).send({ error: { code: "error.notReportable", message: "System events cannot be reported" } });
        }
      }

      // Already reported? Idempotent success, no cooldown consumed.
      const [existing] = await query<RowDataPacket[]>(
        "SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?",
        [userId, targetType, targetId]
      );
      if (existing.length) {
        return reply.send({ reported: true });
      }

      // Cooldown: 15s since this user's last *added* report.
      const [[u]] = await query<RowDataPacket[]>(
        "SELECT last_report_at, TIMESTAMPDIFF(MICROSECOND, last_report_at, NOW()) / 1000 as elapsedMs FROM users WHERE id = ?",
        [userId]
      );
      if (u?.last_report_at && Number(u.elapsedMs) < REPORT_COOLDOWN_MS) {
        const retryMs = Math.ceil(REPORT_COOLDOWN_MS - Number(u.elapsedMs));
        return reply
          .code(429)
          .send({ error: { code: "error.reportCooldown", message: "Please wait before reporting again", retryMs } });
      }

      await query(
        "INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)",
        [userId, targetType, targetId, reason ?? null]
      );
      await query("UPDATE users SET last_report_at = NOW() WHERE id = ?", [userId]);
      await adminLog(userId, "report.add", targetType, targetId);

      await maybeAutoHide(targetType, targetId);
      return reply.send({ reported: true });
    }
  );

  // Remove the caller's report (instant; no cooldown).
  app.delete<{ Params: { type: string; id: string } }>(
    "/api/reports/:type/:id",
    { preHandler: requireOnboarded },
    async (req, reply) => {
      const targetType = req.params.type as TargetType;
      const targetId = parseInt(req.params.id, 10);
      if (!VALID_TYPES.includes(targetType) || Number.isNaN(targetId)) {
        return reply.code(400).send({ error: { code: "error.invalidInput", message: "Invalid target" } });
      }
      await query(
        "DELETE FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?",
        [req.sessionUser!.id, targetType, targetId]
      );
      await adminLog(req.sessionUser!.id, "report.remove", targetType, targetId);
      return reply.send({ reported: false });
    }
  );
}
