import { query } from "../../db.js";

export async function adminLog(
  actorId: number | null,
  action: string,
  targetType?: string,
  targetId?: number,
  meta?: Record<string, unknown>
): Promise<void> {
  await query(
    `INSERT INTO admin_log (actor_id, action, target_type, target_id, meta)
     VALUES (?, ?, ?, ?, ?)`,
    [
      actorId ?? null,
      action,
      targetType ?? null,
      targetId ?? null,
      meta ? JSON.stringify(meta) : null,
    ]
  );
}
