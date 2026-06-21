import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session.js";
import { query } from "../../db.js";
import { adminLog } from "../admin/service.js";
import type { RowDataPacket } from "mysql2";

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  // Public event list: system events pinned first, then approved & active in date order
  app.get("/api/events", { preHandler: requireAuth }, async (_req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT id, name, description, starts_at, duration_minutes, x, y, z, is_system, created_at
       FROM events
       WHERE status = 'approved' AND active = TRUE
       ORDER BY is_system DESC, starts_at ASC`
    );
    return reply.send(rows.map((r) => ({ ...r, isSystem: Boolean(r.is_system) })));
  });

  // Request an event
  app.post<{
    Body: { name: string; description: string; startsAt: string; durationMinutes: number; x?: number; y?: number; z?: number };
  }>("/api/events", { preHandler: requireAuth }, async (req, reply) => {
    const { name, description, startsAt, durationMinutes, x, y, z } = req.body;
    if (!name || name.length > 120) {
      return reply.code(400).send({ error: { code: "error.invalidInput", message: "Invalid name" } });
    }
    if (!startsAt || !durationMinutes) {
      return reply.code(400).send({ error: { code: "error.invalidInput", message: "Missing required fields" } });
    }
    const [result] = await query<RowDataPacket[]>(
      `INSERT INTO events (requested_by, name, description, starts_at, duration_minutes, x, y, z)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.sessionUser!.id, name, description ?? "", startsAt, durationMinutes, x ?? null, y ?? null, z ?? null]
    );
    await adminLog(req.sessionUser!.id, "event.request", "event", (result as any).insertId);
    return reply.code(201).send({ id: (result as any).insertId });
  });
}
