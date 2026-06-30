import type { FastifyInstance } from "fastify";
import { requireOnboarded } from "../../auth/session.js";
import { query } from "../../db.js";
import { adminLog } from "../admin/service.js";
import { getSetting } from "../admin/settings.js";
import type { RowDataPacket } from "mysql2";

async function requireEventsEnabled(req: any, reply: any) {
  if (req.sessionUser?.isAdmin) return;
  const enabled = await getSetting("events_enabled");
  if (!enabled) return reply.code(401).send({ error: { code: "error.featureDisabled", message: "Events are currently disabled" } });
}

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  // Public event list: system pinned first, then approved & active.
  // `mine` flags events the current user created so the UI can show owner actions.
  app.get("/api/events", { preHandler: [requireOnboarded, requireEventsEnabled] }, async (req, reply) => {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT id, name, description, starts_at, duration_minutes, x, y, z, is_system, requested_by, created_at
       FROM events
       WHERE status = 'approved' AND active = TRUE
       ORDER BY is_system DESC, starts_at ASC`
    );
    const uid = req.sessionUser!.id;
    const [reported] = await query<RowDataPacket[]>(
      "SELECT target_id FROM reports WHERE reporter_id = ? AND target_type = 'event'",
      [uid]
    );
    const reportedSet = new Set(reported.map((r) => r.target_id as number));
    return reply.send(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        starts_at: r.starts_at,
        duration_minutes: r.duration_minutes,
        x: r.x,
        y: r.y,
        z: r.z,
        isSystem: Boolean(r.is_system),
        created_at: r.created_at,
        mine: !r.is_system && r.requested_by === uid,
        reported: reportedSet.has(r.id as number),
      }))
    );
  });

  // Current user's own pending events
  app.get("/api/me/events", { preHandler: [requireOnboarded, requireEventsEnabled] }, async (req, reply) => {
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
  }>("/api/events", { preHandler: [requireOnboarded, requireEventsEnabled] }, async (req, reply) => {
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

  // Helper: load an event and assert the caller is its creator or an admin.
  // System events are owner-managed only via the admin panel.
  async function loadOwnedEvent(req: any, reply: any): Promise<RowDataPacket | null> {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      reply.code(400).send({ error: { code: "error.invalidInput", message: "Invalid id" } });
      return null;
    }
    const [rows] = await query<RowDataPacket[]>(
      "SELECT id, requested_by, is_system FROM events WHERE id = ?",
      [id]
    );
    if (!rows.length) {
      reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
      return null;
    }
    const ev = rows[0];
    const isOwner = !ev.is_system && ev.requested_by === req.sessionUser!.id;
    if (!isOwner && !req.sessionUser!.isAdmin) {
      reply.code(403).send({ error: { code: "error.forbidden", message: "Forbidden" } });
      return null;
    }
    return ev;
  }

  // Hide an event (creator or admin) — sets active = FALSE
  app.patch<{ Params: { id: string } }>(
    "/api/events/:id/hide",
    { preHandler: [requireOnboarded, requireEventsEnabled] },
    async (req, reply) => {
      const ev = await loadOwnedEvent(req, reply);
      if (!ev) return;
      await query("UPDATE events SET active = FALSE WHERE id = ?", [ev.id]);
      await adminLog(req.sessionUser!.id, "event.hide", "event", ev.id as number);
      return reply.send({ ok: true });
    }
  );

  // Delete an event (creator or admin)
  app.delete<{ Params: { id: string } }>(
    "/api/events/:id",
    { preHandler: [requireOnboarded, requireEventsEnabled] },
    async (req, reply) => {
      const ev = await loadOwnedEvent(req, reply);
      if (!ev) return;
      await query("DELETE FROM events WHERE id = ?", [ev.id]);
      await adminLog(req.sessionUser!.id, "event.delete", "event", ev.id as number);
      return reply.send({ ok: true });
    }
  );
}
