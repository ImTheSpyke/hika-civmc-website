import { query } from "../../db.js";

/** After a user is approved or changes their mc_username, link notes/tags to their id. */
export async function backfillUsername(mcUsername: string, userId: number): Promise<void> {
  await query(
    "UPDATE player_notes SET target_user_id = ? WHERE target_mc_username = ? COLLATE utf8mb4_bin",
    [userId, mcUsername]
  );
  await query(
    "UPDATE player_tags SET target_user_id = ? WHERE target_mc_username = ? COLLATE utf8mb4_bin",
    [userId, mcUsername]
  );
}

/** When a user is deleted, release their id from notes/tags (username key remains). */
export async function releaseUsername(userId: number): Promise<void> {
  await query(
    "UPDATE player_notes SET target_user_id = NULL WHERE target_user_id = ?",
    [userId]
  );
  await query(
    "UPDATE player_tags SET target_user_id = NULL WHERE target_user_id = ?",
    [userId]
  );
}
