import { fetchOne } from "../db";

export interface Score {
  id: number;
  map_md5: string;
  score: number;
  xp_gained: number;
  pp: number;
  acc: number;
  max_combo: number;
  mods: number;
  n300: number;
  n100: number;
  n50: number;
  nmiss: number;
  ngeki: number;
  nkatu: number;
  grade: string;
  status: number;
  mode: number;
  play_time: Date;
  time_elapsed: number;
  client_flags: number;
  userid: number;
  perfect: number;
  online_checksum: string;
  pinned: number;
  clock_rate: number | null;
}

export async function fetchScoreById(id: number): Promise<Score | null> {
  return fetchOne<Score>(
    `SELECT id, map_md5, score, xp_gained, pp, acc, max_combo, mods, n300, n100, n50,
            nmiss, ngeki, nkatu, grade, status, mode, play_time, time_elapsed,
            client_flags, userid, perfect, online_checksum, pinned, clock_rate
     FROM scores WHERE id = ?`,

    [id]
  );
}
