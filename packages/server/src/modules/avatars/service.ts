import { query } from "../../db.js";
import type { RowDataPacket } from "mysql2";

const MIRRORS = [
  "https://crafatar.imthespyke.fr",
  "https://crafatar-pub.neodium.fr",
  "http://crafatar.com",
] as const;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getAvatar(mcUsername: string): Promise<Buffer | null> {
  // 1. Cache hit
  const [rows] = await query<RowDataPacket[]>(
    "SELECT image_base64, fetched_at FROM avatar_cache WHERE mc_username = ?",
    [mcUsername]
  );
  if (rows.length) {
    const age = Date.now() - new Date(rows[0].fetched_at as string).getTime();
    if (age < CACHE_TTL_MS) {
      return Buffer.from(rows[0].image_base64 as string, "base64");
    }
  }

  // 2. Resolve UUID via Mojang
  let uuid: string;
  try {
    uuid = await uuidFromUsername(mcUsername);
  } catch {
    return null; // Unknown username → caller serves Steve placeholder
  }

  // 3. Fetch head from Crafatar mirrors
  let imageBytes: Buffer | null = null;
  for (const base of MIRRORS) {
    const url = `${base}/renders/head/${uuid}?overlay=true`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      imageBytes = Buffer.from(await res.arrayBuffer());
      break;
    } catch {
      continue;
    }
  }

  if (!imageBytes) return null; // All mirrors down

  // 4. Cache & return
  const b64 = imageBytes.toString("base64");
  await query(
    `INSERT INTO avatar_cache (mc_username, uuid, image_base64, fetched_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE uuid = VALUES(uuid), image_base64 = VALUES(image_base64), fetched_at = NOW()`,
    [mcUsername, uuid, b64]
  );

  return imageBytes;
}

async function uuidFromUsername(username: string): Promise<string> {
  const r = await fetch(
    `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`
  );
  if (!r.ok) throw new Error(`Unknown username: ${username}`);
  return ((await r.json()) as { id: string }).id;
}
