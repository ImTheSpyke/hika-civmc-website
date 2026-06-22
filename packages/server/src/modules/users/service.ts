import { query } from "../../db.js";

/** After a user is approved or changes their mc_username, link notes/tags to their id. */
export async function backfillUsername(mcUsername: string, userId: number): Promise<void> {
  await query(
    "UPDATE player_notes SET target_user_id = ? WHERE target_mc_username = ?",
    [userId, mcUsername]
  );
  await query(
    "UPDATE player_tags SET target_user_id = ? WHERE target_mc_username = ?",
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

/**
 * Re-links all player_notes and player_tags rows to their matching approved user.
 * Safe to run at any time; used on boot and via admin endpoint.
 */
export async function rebackfillAll(): Promise<void> {
  // Link notes: for every approved user with a mc_username, set target_user_id on
  // all notes/tags that share the mc_username but are currently unlinked or stale.
  await query(`
    UPDATE player_notes pn
    JOIN users u ON u.mc_username = pn.target_mc_username AND u.status = 'approved'
    SET pn.target_user_id = u.id
    WHERE pn.target_user_id IS NULL OR pn.target_user_id != u.id
  `);
  await query(`
    UPDATE player_tags pt
    JOIN users u ON u.mc_username = pt.target_mc_username AND u.status = 'approved'
    SET pt.target_user_id = u.id
    WHERE pt.target_user_id IS NULL OR pt.target_user_id != u.id
  `);
  // Also clear links where the linked user no longer has that mc_username
  await query(`
    UPDATE player_notes pn
    JOIN users u ON u.id = pn.target_user_id
    SET pn.target_user_id = NULL
    WHERE u.mc_username != pn.target_mc_username OR u.status != 'approved'
  `);
  await query(`
    UPDATE player_tags pt
    JOIN users u ON u.id = pt.target_user_id
    SET pt.target_user_id = NULL
    WHERE u.mc_username != pt.target_mc_username OR u.status != 'approved'
  `);
}
