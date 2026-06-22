import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import fastifyRateLimit from "@fastify/rate-limit";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { initDb } from "./db.js";
import { loadSession } from "./auth/session.js";
import { rebackfillAll } from "./modules/users/service.js";
import { authRoutes } from "./auth/routes.js";
import { usersRoutes } from "./modules/users/routes.js";
import { avatarsRoutes } from "./modules/avatars/routes.js";
import { globalNotesRoutes } from "./modules/global-notes/routes.js";
import { playerNotesRoutes } from "./modules/player-notes/routes.js";
import { tagsRoutes } from "./modules/tags/routes.js";
import { newspapersRoutes } from "./modules/newspapers/routes.js";
import { eventsRoutes } from "./modules/events/routes.js";
import { moderationRoutes } from "./modules/moderation/routes.js";
import { adminRoutes } from "./modules/admin/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function start(): Promise<void> {
  await initDb();
  await rebackfillAll();

  const app = Fastify({ logger: true });

  await app.register(fastifyCookie);

  await app.register(fastifyRateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (req) => {
      const u = (req as any).sessionUser;
      return u ? `user-${u.id}` : req.ip;
    },
  });

  // Load session on every request
  app.addHook("preHandler", loadSession);

  // API routes
  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(avatarsRoutes);
  await app.register(globalNotesRoutes);
  await app.register(playerNotesRoutes);
  await app.register(tagsRoutes);
  await app.register(newspapersRoutes);
  await app.register(eventsRoutes);
  await app.register(moderationRoutes);
  await app.register(adminRoutes);

  // Serve static SPA in production
  if (config.nodeEnv === "production") {
    const publicDir = path.join(__dirname, "..", "public");
    await app.register(fastifyStatic, { root: publicDir, prefix: "/" });

    // SPA fallback — all non-API routes serve index.html
    app.setNotFoundHandler(async (req, reply) => {
      if (!req.url.startsWith("/api")) {
        const html = await fs.readFile(path.join(publicDir, "index.html"));
        return reply.type("text/html").send(html);
      }
      return reply.code(404).send({ error: { code: "error.notFound", message: "Not found" } });
    });
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`Server running on port ${config.port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
