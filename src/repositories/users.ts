import { fetchOne, fetchAll } from "../db";

export interface User {
  id: number;
  name: string;
  safe_name: string;
  priv: number;
  country: string;
  silence_end: number;
  donor_end: number;
  creation_time: number;
  latest_activity: number;
  clan_id: number;
  clan_priv: number;
  preferred_mode: number;
  play_style: number;
  custom_badge_name: string | null;
  custom_badge_icon: string | null;
  userpage_content: string | null;
  api_key: string | null;
  whitelist: number;
  preferred_metric: string;
}

const READ_COLS =
  "id, name, safe_name, priv, country, silence_end, donor_end, creation_time, latest_activity, " +
  "clan_id, clan_priv, preferred_mode, play_style, custom_badge_name, custom_badge_icon, " +
  "userpage_content, api_key, whitelist, preferred_metric";

export async function fetchUserById(id: number): Promise<User | null> {
  return fetchOne<User>(`SELECT ${READ_COLS} FROM users WHERE id = ?`, [id]);
}

export async function fetchUserByName(name: string): Promise<User | null> {
  return fetchOne<User>(`SELECT ${READ_COLS} FROM users WHERE name = ?`, [name]);
}

export async function fetchUserCount(): Promise<number> {
  const row = await fetchOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM users"
  );
  return row?.count ?? 0;
}

export async function fetchUsersByClan(clanId: number): Promise<User[]> {
  return fetchAll<User>(`SELECT ${READ_COLS} FROM users WHERE clan_id = ?`, [
    clanId,
  ]);
}
