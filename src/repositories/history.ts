import { fetchOne, fetchAll } from "../db";
import { getRedis } from "../redis";

export interface PPHistoryRow {
  user_id: number;
  mode: number;
  captured_at: Date;
  pp: number;
}

export interface RankHistoryRow {
  user_id: number;
  mode: number;
  captured_at: Date;
  rank: number;
  c_rank: number;
}

export interface PeakRankRow {
  user_id: number;
  mode: number;
  captured_at: Date;
  rank: number;
}

export async function fetchPPHistory(
  userId: number,
  mode: number,
  limit = 89
): Promise<PPHistoryRow[]> {
  return fetchAll<PPHistoryRow>(
    `SELECT user_id, mode, captured_at, pp
     FROM user_profile_history
     WHERE user_id = ? AND mode = ?
     ORDER BY captured_at DESC
     LIMIT ?`,
    [userId, mode, limit]
  );
}

export async function fetchCurrentPP(
  userId: number,
  mode: number
): Promise<{ captured_at: Date; pp: number } | null> {
  const row = await fetchOne<{ pp: number }>(
    "SELECT pp FROM stats WHERE id = ? AND mode = ?",
    [userId, mode]
  );
  if (!row || !row.pp) return null;
  return { captured_at: new Date(), pp: row.pp };
}

export async function fetchRankHistory(
  userId: number,
  mode: number,
  limit = 89
): Promise<RankHistoryRow[]> {
  return fetchAll<RankHistoryRow>(
    `SELECT user_id, mode, captured_at, rank, country_rank AS c_rank
     FROM user_profile_history
     WHERE user_id = ? AND mode = ?
     ORDER BY captured_at DESC
     LIMIT ?`,
    [userId, mode, limit]
  );
}

export async function fetchPeakRank(
  userId: number,
  mode: number
): Promise<PeakRankRow | null> {
  return fetchOne<PeakRankRow>(
    `SELECT user_id, mode, captured_at, rank
     FROM user_profile_history
     WHERE user_id = ? AND mode = ? AND rank > 0
     ORDER BY rank ASC, captured_at ASC
     LIMIT 1`,
    [userId, mode]
  );
}

export async function fetchCurrentRankWithCountry(
  userId: number,
  mode: number,
  country: string
): Promise<{ captured_at: Date; rank: number; c_rank: number } | null> {
  const redis = getRedis();
  const rank = await redis.zrevrank(
    `bancho:leaderboard:${mode}`,
    String(userId)
  );
  const cRank = await redis.zrevrank(
    `bancho:leaderboard:${mode}:${country.toLowerCase()}`,
    String(userId)
  );
  if (rank === null || cRank === null) return null;
  return {
    captured_at: new Date(),
    rank: rank + 1,
    c_rank: cRank + 1,
  };
}
