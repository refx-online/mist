import { fetchAll } from "../db";

export interface Stat {
  id: number;
  mode: number;
  tscore: number;
  rscore: number;
  pp: number;
  plays: number;
  playtime: number;
  acc: number;
  max_combo: number;
  total_hits: number;
  replay_views: number;
  xh_count: number;
  x_count: number;
  sh_count: number;
  s_count: number;
  a_count: number;
  xp: number;
}

export async function fetchStatsByPlayer(playerId: number): Promise<Stat[]> {
  return fetchAll<Stat>(
    `SELECT id, mode, tscore, rscore, pp, plays, playtime, acc, max_combo,
            total_hits, replay_views, xh_count, x_count, sh_count, s_count, a_count, xp
     FROM stats WHERE id = ?`,
    [playerId]
  );
}
