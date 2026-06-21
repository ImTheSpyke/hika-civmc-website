import type { FastifyRequest, FastifyReply } from "fastify";
import { query } from "../db.js";
import type { RowDataPacket } from "mysql2";

export interface SessionUser {
  id: number;
  discordId: string;
  discordUsername: string;
  discordDisplayName: string;
  mcUsername: string | null;
  mcVerified: boolean;
  status: "pending" | "approved" | "rejected";
  isAdmin: boolean;
  publicFactionTag: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    sessionUser?: SessionUser;
  }
}

export async function loadSession(
  req: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const token = (req.cookies as Record<string, string>)["session"];
  if (!token) return;

  const [rows] = await query<RowDataPacket[]>(
    `SELECT u.id, u.discord_id, u.discord_username, u.discord_display_name,
            u.mc_username, u.mc_verified, u.status, u.is_admin, u.public_faction_tag
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > NOW()`,
    [token]
  );

  if (!rows.length) return;
  const r = rows[0];
  req.sessionUser = {
    id: r.id,
    discordId: r.discord_id,
    discordUsername: r.discord_username,
    discordDisplayName: r.discord_display_name,
    mcUsername: r.mc_username,
    mcVerified: Boolean(r.mc_verified),
    status: r.status,
    isAdmin: Boolean(r.is_admin),
    publicFactionTag: r.public_faction_tag,
  };

  // throttled last_seen_at update (~1 min granularity)
  if (req.sessionUser.status === "approved") {
    await query(
      `UPDATE users SET last_seen_at = NOW()
       WHERE id = ? AND last_seen_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
      [r.id]
    );
  }
}

export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!req.sessionUser) {
    return reply.code(401).send({ error: { code: "error.unauthorized", message: "Not logged in" } });
  }
  if (req.sessionUser.status === "pending") {
    return reply.code(403).send({ error: { code: "error.pending", message: "Account pending approval" } });
  }
  if (req.sessionUser.status === "rejected") {
    return reply.code(403).send({ error: { code: "error.rejected", message: "Account rejected" } });
  }
}

export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(req, reply);
  if (reply.sent) return;
  if (!req.sessionUser?.isAdmin) {
    return reply.code(403).send({ error: { code: "error.forbidden", message: "Admin only" } });
  }
}
