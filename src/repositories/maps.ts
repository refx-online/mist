import { fetchOne, fetchAll } from "../db";
import { GameMode } from "../constants/gamemodes";
import { beatmapAsDict, BeatmapRow } from "../types/beatmap";

export async function fetchBeatmapByMd5(
  md5: string
): Promise<BeatmapRow | null> {
  return fetchOne<BeatmapRow>(
    `SELECT md5, id, set_id, status, artist, title, version, creator,
            last_update, total_length, max_combo, plays, passes, mode,
            bpm, cs, od, ar, hp, diff
     FROM maps WHERE md5 = ?`,
    [md5]
  );
}

export async function fetchBeatmapById(
  id: number
): Promise<BeatmapRow | null> {
  return fetchOne<BeatmapRow>(
    `SELECT md5, id, set_id, status, artist, title, version, creator,
            last_update, total_length, max_combo, plays, passes, mode,
            bpm, cs, od, ar, hp, diff
     FROM maps WHERE id = ?`,
    [id]
  );
}

export { beatmapAsDict };
