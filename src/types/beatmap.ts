export interface BeatmapRow {
  md5: string;
  id: number;
  set_id: number;
  artist: string;
  title: string;
  version: string;
  creator: string;
  last_update: Date;
  total_length: number;
  max_combo: number;
  status: number;
  plays: number;
  passes: number;
  mode: number;
  bpm: number;
  cs: number;
  od: number;
  ar: number;
  hp: number;
  diff: number;
}

export function beatmapAsDict(b: BeatmapRow): Record<string, unknown> {
  return {
    md5: b.md5,
    id: b.id,
    set_id: b.set_id,
    artist: b.artist,
    title: b.title,
    version: b.version,
    creator: b.creator,
    last_update: b.last_update,
    total_length: b.total_length,
    max_combo: b.max_combo,
    status: b.status,
    plays: b.plays,
    passes: b.passes,
    mode: b.mode,
    bpm: b.bpm,
    cs: b.cs,
    od: b.od,
    ar: b.ar,
    hp: b.hp,
    diff: b.diff,
  };
}
