import { fetchOne } from "../db";

export interface Clan {
  id: number;
  name: string;
  tag: string;
  owner: number;
  created_at: Date;
}

export async function fetchClanById(id: number): Promise<Clan | null> {
  return fetchOne<Clan>(
    "SELECT id, name, tag, owner, created_at FROM clans WHERE id = ?",
    [id]
  );
}
