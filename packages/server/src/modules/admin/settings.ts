import { query } from "../../db.js";
import type { RowDataPacket } from "mysql2";

export type SettingKey =
  | "auto_approve_accounts"
  | "auto_approve_username_changes"
  | "auto_approve_newspapers";

export async function getSetting(key: SettingKey): Promise<boolean> {
  const [rows] = await query<RowDataPacket[]>(
    "SELECT `value` FROM site_settings WHERE `key` = ?",
    [key]
  );
  return rows[0]?.value === "true";
}

export async function setSetting(key: SettingKey, value: boolean): Promise<void> {
  await query(
    "INSERT INTO site_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
    [key, value ? "true" : "false"]
  );
}

export async function getAllSettings(): Promise<Record<SettingKey, boolean>> {
  const [rows] = await query<RowDataPacket[]>("SELECT `key`, `value` FROM site_settings");
  const out: Partial<Record<SettingKey, boolean>> = {};
  for (const row of rows) {
    out[row.key as SettingKey] = row.value === "true";
  }
  return {
    auto_approve_accounts: false,
    auto_approve_username_changes: false,
    auto_approve_newspapers: false,
    ...out,
  };
}
