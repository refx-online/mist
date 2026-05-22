import { User } from "../repositories/users";
import { modsFromString } from "../constants/mods";

export const REPLAYS_PATH = process.env.REPLAYS_PATH ?? ".data/osr";

export function parseMods(modsArg: string | undefined): { mods: number; equality: "strong" | "weak" | null } {
  if (!modsArg) return { mods: 0, equality: null };

  let equality: "strong" | "weak" | null = null;
  let raw = modsArg;

  if (raw.startsWith("=")) {
    equality = "strong";
    raw = raw.slice(1);
  } else if (raw.startsWith("~")) {
    equality = "weak";
    raw = raw.slice(1);
  }

  const asNum = Number(raw);
  const mods = isNaN(asNum) ? modsFromString(raw) : asNum;
  return { mods, equality };
}

export function userAsDict(u: User): Record<string, unknown> {
  return {
    id: u.id,
    name: u.name,
    safe_name: u.safe_name,
    priv: u.priv,
    country: u.country,
    silence_end: u.silence_end,
    donor_end: u.donor_end,
    creation_time: u.creation_time,
    latest_activity: u.latest_activity,
    clan_id: u.clan_id,
    clan_priv: u.clan_priv,
    preferred_mode: u.preferred_mode,
    play_style: u.play_style,
    custom_badge_name: u.custom_badge_name,
    custom_badge_icon: u.custom_badge_icon,
    userpage_content: u.userpage_content,
  };
}

export function statAsDict(s: Record<string, unknown>): Record<string, unknown> {
  return {
    id: s.id,
    mode: s.mode,
    tscore: s.tscore,
    rscore: s.rscore,
    pp: s.pp,
    plays: s.plays,
    playtime: s.playtime,
    acc: r3(s.acc),
    max_combo: s.max_combo,
    total_hits: s.total_hits,
    replay_views: s.replay_views,
    xh_count: s.xh_count,
    x_count: s.x_count,
    sh_count: s.sh_count,
    s_count: s.s_count,
    a_count: s.a_count,
    xp: s.xp,
  };
}

export function r2(v: unknown): number {
  return Math.round(Number(v) * 100) / 100;
}

export function r3(v: unknown): number {
  return Math.round(Number(v) * 1000) / 1000;
}

export function fmtDatetime(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v as string);
  return d.toISOString().replace("T", "T").slice(0, 19);
}
