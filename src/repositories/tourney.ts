import { fetchOne, fetchAll } from "../db";

export interface TourneyPool {
  id: number;
  name: string;
  created_at: Date;
  created_by: number;
}

export interface TourneyPoolMap {
  map_id: number;
  pool_id: number;
  mods: number;
  slot: number;
}

export async function fetchPoolById(id: number): Promise<TourneyPool | null> {
  return fetchOne<TourneyPool>(
    "SELECT id, name, created_at, created_by FROM tourney_pools WHERE id = ?",
    [id]
  );
}

export async function fetchPoolMaps(
  poolId: number
): Promise<TourneyPoolMap[]> {
  return fetchAll<TourneyPoolMap>(
    "SELECT map_id, pool_id, mods, slot FROM tourney_pool_maps WHERE pool_id = ?",
    [poolId]
  );
}
