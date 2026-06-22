import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session.js";
import { query } from "../../db.js";
import { adminLog } from "../admin/service.js";
import type { RowDataPacket } from "mysql2";

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  // Public event list: system pinned first, then approved & active
  app.get("/api/events", { preHandler: requireAuth }, async (_req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT id, name, description, starts_at, duration_minutes, x, y, z, is_system, created_at
       FROM events
       WHERE status = 'approved' AND active = TRUE
       ORDER BY is_system DESC, starts_at ASC`
    );
    return reply.send(rows.map((r) => ({ ...r, isSystem: Boolean(r.is_system) })));
  });

  // Current user's own pending events
  app.get("/api/me/events", { preHandler: requireAuth }, async (req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT id, name, description, starts_at, duration_minutes, x, y, z, status, created_at
       FROM events WHERE requested_by = ? AND status = 'pending' ORDER BY created_at DESC`,
      [req.sessionUser!.id]
    );
    return reply.send(rows);
  });

  // Request an event — rate limited: 1 per 5 minutes per user
  app.post<{
    Body: { name: string; description: string; startsAt: string; durationMinutes: number; x?: number; y?: number; z?: number };
  }>("/api/events", { preHandler: requireAuth }, async (req, reply) => {
    const { name, description, startsAt, durationMinutes, x, y, z } = req.body;
    if (!name?.trim() || name.length > 120) {
      return reply.code(400).send({ error: { code: "error.invalidInput", message: "Name is required (max 120 chars)" } });
    }
    if (!startsAt) {
      return reply.code(400).send({ error: { code: "error.invalidInput", message: "Start date is required" } });
    }
    if (!durationMinutes || durationMinutes < 1) {
      return reply.code(400).send({ error: { code: "error.invalidInput", message: "Duration must be at least 1 minute" } });
    }

    // 1 submission per 5 minutes
    const [[{ recent }]] = await query<RowDataPacket[]>(
      `SELECT COUNT(*) as recent FROM events
       WHERE requested_by = ? AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
      [req.sessionUser!.id]
    );
    if (recent > 0) {
      return reply.code(429).send({ error: { code: "error.rateLimited", message: "You can only submit one event every 5 minutes" } });
    }

    const [result] = await query<RowDataPacket[]>(
      `INSERT INTO events (requested_by, name, description, starts_at, duration_minutes, x, y, z)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.sessionUser!.id, name.trim(), description ?? "", startsAt, durationMinutes, x ?? null, y ?? null, z ?? null]
    );
    await adminLog(req.sessionUser!.id, "event.request", "event", (result as any).insertId);
    return reply.code(201).send({ id: (result as any).insertId });
  });
}
