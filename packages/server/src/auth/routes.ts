import type { FastifyInstance } from "fastify";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { query } from "../db.js";
import { config } from "../config.js";
import { adminLog } from "../modules/admin/service.js";
import type { RowDataPacket } from "mysql2";

const DISCORD_API = "https://discord.com/api/v10";
const STATE_COOKIE = "oauth_state";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Start Discord OAuth flow
  app.get("/api/auth/discord", async (_req, reply) => {
    const state = randomBytes(32).toString("hex");
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 300, // 5-minute window
      secure: config.nodeEnv === "production",
    });
    const params = new URLSearchParams({
      client_id: config.discord.clientId,
      redirect_uri: config.discord.redirectUri,
      response_type: "code",
      scope: "identify",
      state,
    });
    return reply.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  // Discord callback
  app.get<{ Querystring: { code?: string; error?: string; state?: string } }>(
    "/api/auth/discord/callback",
    async (req, reply) => {
      const { code, error, state } = req.query;

      // Validate state before anything else (CSRF / account fixation protection)
      const storedState = (req.cookies as Record<string, string>)[STATE_COOKIE];
      reply.clearCookie(STATE_COOKIE, { path: "/" });
      if (
        !state ||
        !storedState ||
        !timingSafeEqual(Buffer.from(state), Buffer.from(storedState))
      ) {
        return reply.redirect("/?auth=error");
      }

      if (error || !code) {
        return reply.redirect("/?auth=cancelled");
      }

      // Exchange code for access token
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.discord.clientId,
          client_secret: config.discord.clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: config.discord.redirectUri,
        }),
      });
      if (!tokenRes.ok) return reply.redirect("/?auth=error");

      const { access_token } = (await tokenRes.json()) as { access_token: string };

      // Fetch Discord profile
      const profileRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!profileRes.ok) return reply.redirect("/?auth=error");

      const profile = (await profileRes.json()) as {
        id: string;
        username: string;
        global_name?: string;
      };

      // Upsert user
      const displayName = profile.global_name ?? profile.username;
      await query(
        `INSERT INTO users (discord_id, discord_username, discord_display_name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           discord_username = VALUES(discord_username),
           discord_display_name = VALUES(discord_display_name),
           last_seen_at = NOW()`,
        [profile.id, profile.username, displayName]
      );

      const [rows] = await query<RowDataPacket[]>(
        "SELECT id, status FROM users WHERE discord_id = ?",
        [profile.id]
      );
      const user = rows[0];

      // Log new user creation (only if just inserted — status defaults to pending)
      const isNew = user.status === "pending";
      if (isNew) {
        await adminLog(null, "user.create", "user", user.id, { discordId: profile.id });
      }
      await adminLog(user.id, "user.connect");

      // Bootstrap super-admin: auto-approve and grant admin on first login
      if (config.superadminDiscordId && profile.id === config.superadminDiscordId) {
        await query(
          "UPDATE users SET status = 'approved', is_admin = TRUE WHERE id = ?",
          [user.id]
        );
      }

      // Create session (30-day expiry)
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await query(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
        [token, user.id, expiresAt]
      );

      reply.setCookie("session", token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
        secure: config.nodeEnv === "production",
      });

      return reply.redirect("/");
    }
  );

  // Logout — POST only (GET logout is a CSRF vector)
  // addContentTypeParser covers form submissions from the pending/rejected page
  app.addContentTypeParser("application/x-www-form-urlencoded", (_req, _payload, done) => done(null, {}));
  app.post("/api/auth/logout", async (req, reply) => {
    const token = (req.cookies as Record<string, string>)["session"];
    if (token) {
      await query("DELETE FROM sessions WHERE id = ?", [token]);
    }
    reply.clearCookie("session", { path: "/" });
    return reply.redirect("/");
  });
}
