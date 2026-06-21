import type { FastifyInstance } from "fastify";
import { getAvatar } from "./service.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function avatarsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { username: string } }>(
    "/api/avatars/:username",
    async (req, reply) => {
      const { username } = req.params;

      if (!/^[a-zA-Z0-9_]{1,16}$/.test(username)) {
        return serveSteve(reply);
      }

      const imageBytes = await getAvatar(username);
      if (!imageBytes) {
        return serveSteve(reply);
      }

      return reply
        .header("Content-Type", "image/png")
        .header("Cache-Control", "public, max-age=86400")
        .send(imageBytes);
    }
  );
}

async function serveSteve(reply: ReturnType<FastifyInstance["inject"]>["reply"] | any): Promise<void> {
  try {
    const stevePath = path.join(__dirname, "steve.png");
    const bytes = await readFile(stevePath);
    return reply
      .header("Content-Type", "image/png")
      .header("Cache-Control", "public, max-age=3600")
      .send(bytes);
  } catch {
    return reply.code(404).send();
  }
}
