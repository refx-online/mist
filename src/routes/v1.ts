import { FastifyInstance } from "fastify";
import { readFile } from "fs/promises";
import path from "path";

import { fetchOne, fetchAll } from "../db";
import { getRedis } from "../redis";
import { GameMode, INVALID_MODES } from "../constants/gamemodes";
import { Mods, modsToString, modsFromString } from "../constants/mods";
import { Privileges } from "../constants/privileges";
import { fetchUserById, fetchUserByName, fetchUsersByClan, User } from "../repositories/users";
import { fetchBeatmapByMd5, fetchBeatmapById, beatmapAsDict } from "../repositories/maps";
import { fetchClanById } from "../repositories/clans";
import { fetchStatsByPlayer } from "../repositories/stats";
import { fetchScoreById } from "../repositories/scores";
import {
  fetchPPHistory,
  fetchCurrentPP,
  fetchRankHistory,
  fetchPeakRank,
  fetchCurrentRankWithCountry,
} from "../repositories/history";
import { fetchPoolById, fetchPoolMaps } from "../repositories/tourney";

const REPLAYS_PATH = process.env.REPLAYS_PATH ?? ".data/osr";

function parseMods(modsArg: string | undefined): { mods: number; equality: "strong" | "weak" | null } {
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

function userAsDict(u: User): Record<string, unknown> {
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

function statAsDict(s: Record<string, unknown>): Record<string, unknown> {
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

function r2(v: unknown): number {
  return Math.round(Number(v) * 100) / 100;
}

function r3(v: unknown): number {
  return Math.round(Number(v) * 1000) / 1000;
}

function fmtDatetime(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v as string);
  return d.toISOString().replace("T", "T").slice(0, 19);
}

export async function v1Router(app: FastifyInstance) {
  // GET /search_players
  app.get("/search_players", async (req, reply) => {
    const { q, nerv } = req.query as { q?: string; nerv?: string };

    if (!q || q.length < 2) {
      return reply.send({ status: "error", message: "Query must be at least 2 characters." });
    }

    const includeRestricted = nerv === "true" || nerv === "1";
    let privClause = "AND priv & ? != 0";
    const params: unknown[] = [`%${q}%`, Privileges.UNRESTRICTED];

    if (includeRestricted) {
      privClause = "";
      params.pop();
    }

    const rows = await fetchAll<User>(
      `SELECT id, name, safe_name, priv, country, silence_end, donor_end, creation_time,
              latest_activity, clan_id, clan_priv, preferred_mode, play_style,
              custom_badge_name, custom_badge_icon, userpage_content, api_key, whitelist, preferred_metric
       FROM users
       WHERE safe_name LIKE ? ${privClause}
       LIMIT 50`,
      params
    );

    return reply.send({
      status: "success",
      results: rows.length,
      result: rows.map((u) => ({
        id: u.id,
        name: u.name,
      })),
    });
  });

  // GET /get_player_info
  app.get("/get_player_info", async (req, reply) => {
    const { id, name, scope } = req.query as { id?: string; name?: string; scope?: string };

    let user: User | null = null;
    if (id) {
      user = await fetchUserById(Number(id));
    } else if (name) {
      user = await fetchUserByName(name);
    } else {
      return reply.send({ status: "error", message: "Must provide id or name." });
    }

    if (!user) {
      return reply.send({ status: "error", message: "Player not found." });
    }

    const requestedScope = scope ?? "all";
    const result: Record<string, unknown> = { status: "success" };

    const playerData: Record<string, unknown> = {};

    if (requestedScope === "info" || requestedScope === "all") {
      playerData.info = userAsDict(user);
    }

    if (requestedScope === "stats" || requestedScope === "all") {
      const stats = await fetchStatsByPlayer(user.id);
      const redis = getRedis();

      const statsDict: Record<string, unknown> = {};
      await Promise.all(
        stats.map(async (s) => {
          const globalRank = await redis.zrevrank(
            `bancho:leaderboard:${s.mode}`,
            String(user!.id)
          );
          const countryRank = await redis.zrevrank(
            `bancho:leaderboard:${s.mode}:${user!.country.toLowerCase()}`,
            String(user!.id)
          );

          statsDict[String(s.mode)] = {
            ...statAsDict(s as unknown as Record<string, unknown>),
            rank: globalRank !== null ? globalRank + 1 : 0,
            country_rank: countryRank !== null ? countryRank + 1 : 0,
          };
        })
      );

      playerData.stats = statsDict;
    }

    result.player = playerData;
    return reply.send(result);
  });

  // GET /get_player_scores
  app.get("/get_player_scores", async (req, reply) => {
    const query = req.query as {
      id?: string;
      name?: string;
      scope?: string;
      mods?: string;
      mode?: string;
      limit?: string;
      include_loved?: string;
      include_failed?: string;
    };

    let user: User | null = null;
    if (query.id) {
      user = await fetchUserById(Number(query.id));
    } else if (query.name) {
      user = await fetchUserByName(query.name);
    } else {
      return reply.send({ status: "error", message: "Must provide id or name." });
    }

    if (!user) {
      return reply.send({ status: "error", message: "Player not found." });
    }

    const scope = query.scope ?? "recent";
    const mode = query.mode !== undefined ? Number(query.mode) : 0;
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const includeLoved = query.include_loved === "true" || query.include_loved === "1";
    const includeFailed = query.include_failed === "true" || query.include_failed === "1";
    const { mods, equality } = parseMods(query.mods);

    if (INVALID_MODES.has(mode)) {
      return reply.send({ status: "error", message: "Invalid mode." });
    }

    let orderBy: string;
    let statusClause: string;

    switch (scope) {
      case "best":
        orderBy = "s.pp DESC";
        statusClause = includeLoved ? "s.status IN (2, 5)" : "s.status = 2";
        break;
      case "first":
        orderBy = "s.play_time ASC";
        statusClause = includeLoved ? "s.status IN (2, 5)" : "s.status = 2";
        break;
      case "pinned":
        orderBy = "s.pp DESC";
        statusClause = "s.pinned = 1";
        break;
      default: // recent
        orderBy = "s.play_time DESC";
        statusClause = includeFailed ? "s.status >= 0" : "s.status >= 1";
        break;
    }

    let modsClause = "";
    const params: unknown[] = [user.id, mode];

    if (mods && equality) {
      if (equality === "strong") {
        modsClause = "AND s.mods = ?";
        params.push(mods);
      } else {
        modsClause = "AND s.mods & ? = ?";
        params.push(mods, mods);
      }
    }

    params.push(limit);

    const scores = await fetchAll<Record<string, unknown>>(
      `SELECT s.id, s.map_md5, s.score, s.xp_gained, s.pp, s.acc, s.max_combo,
              s.mods, s.n300, s.n100, s.n50, s.nmiss, s.ngeki, s.nkatu,
              s.grade, s.status, s.mode, s.play_time, s.time_elapsed,
              s.userid, s.perfect, s.pinned, s.clock_rate,
              l.mods_json
       FROM scores s
       LEFT JOIN lazer_scores l ON l.score_id = s.id
       WHERE s.userid = ? AND s.mode = ? AND ${statusClause} ${modsClause}
       ORDER BY ${orderBy}
       LIMIT ${limit}`,
      params.slice(0, -1)
    );

    // fetch clan for player info
    let clan: { id: number; name: string; tag: string } | null = null;
    if (user.clan_id) {
      const clanRow = await fetchClanById(user.clan_id);
      if (clanRow) clan = { id: clanRow.id, name: clanRow.name, tag: clanRow.tag };
    }

    return reply.send({
      status: "success",
      scores: await Promise.all(scores.map(async (s) => {
        const modsJson = s.mods_json ? JSON.parse(s.mods_json as string) : null;
        const bmap = await fetchBeatmapByMd5(s.map_md5 as string);
        const result: Record<string, unknown> = {
          id: s.id,
          score: s.score,
          pp: r2(s.pp),
          acc: r3(s.acc),
          max_combo: s.max_combo,
          mods: s.mods,
          n300: s.n300,
          n100: s.n100,
          n50: s.n50,
          nmiss: s.nmiss,
          ngeki: s.ngeki,
          nkatu: s.nkatu,
          grade: s.grade,
          status: s.status,
          mode: s.mode,
          play_time: fmtDatetime(s.play_time),
          time_elapsed: s.time_elapsed,
          perfect: s.perfect,
          xp_gained: r3(s.xp_gained),
          pinned: s.pinned,
          clock_rate: s.clock_rate,
        };
        if (modsJson) {
          result.mods_json = modsJson;
        } else {
          result.mods_json = null;
          result.mods_readable = modsToString(Number(s.mods));
        }
        result.beatmap = bmap ? beatmapAsDict(bmap) : null;
        return result;
      })),
      player: {
        id: user.id,
        name: user.name,
        clan,
      },
    });
  });

  // GET /get_player_most_played
  app.get("/get_player_most_played", async (req, reply) => {
    const { id, name, limit: limitStr, mode } = req.query as {
      id?: string;
      name?: string;
      limit?: string;
      mode?: string;
    };

    let user: User | null = null;
    if (id) {
      user = await fetchUserById(Number(id));
    } else if (name) {
      user = await fetchUserByName(name);
    } else {
      return reply.send({ status: "error", message: "Must provide id or name." });
    }

    if (!user) {
      return reply.send({ status: "error", message: "Player not found." });
    }

    const modeVal = mode !== undefined ? Number(mode) : 0;
    const limit = Math.min(Math.max(Number(limitStr) || 25, 1), 100);

    const rows = await fetchAll<Record<string, unknown>>(
      `SELECT m.md5, m.id, m.set_id, m.status,
              m.artist, m.title, m.version, m.creator, COUNT(*) AS plays
       FROM scores s
       INNER JOIN maps m ON m.md5 = s.map_md5
       WHERE s.userid = ? AND s.mode = ?
       GROUP BY s.map_md5
       ORDER BY plays DESC
       LIMIT ${limit}`,
      [user.id, modeVal]
    );

    return reply.send({ status: "success", maps: rows });
  });

  // GET /get_map_info
  app.get("/get_map_info", async (req, reply) => {
    const { id, md5 } = req.query as { id?: string; md5?: string };

    let bmap;
    if (md5) {
      bmap = await fetchBeatmapByMd5(md5);
    } else if (id) {
      bmap = await fetchBeatmapById(Number(id));
    } else {
      return reply.send({ status: "error", message: "Must provide id or md5." });
    }

    if (!bmap) {
      return reply.send({ status: "error", message: "Beatmap not found." });
    }

    return reply.send({ status: "success", map: beatmapAsDict(bmap) });
  });

  // GET /get_map_scores
  app.get("/get_map_scores", async (req, reply) => {
    const query = req.query as {
      id?: string;
      md5?: string;
      scope?: string;
      mods?: string;
      mode?: string;
      limit?: string;
    };

    let bmap;
    if (query.md5) {
      bmap = await fetchBeatmapByMd5(query.md5);
    } else if (query.id) {
      bmap = await fetchBeatmapById(Number(query.id));
    } else {
      return reply.send({ status: "error", message: "Must provide id or md5." });
    }

    if (!bmap) {
      return reply.send({ status: "error", message: "Beatmap not found." });
    }

    const scope = query.scope ?? "best";
    const mode = query.mode !== undefined ? Number(query.mode) : 0;
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const { mods, equality } = parseMods(query.mods);

    let orderBy: string;
    if (scope === "recent") {
      orderBy = "s.play_time DESC";
    } else {
      orderBy = "s.pp DESC, s.score DESC";
    }

    let modsClause = "";
    const params: unknown[] = [bmap.md5, mode];

    if (mods && equality) {
      if (equality === "strong") {
        modsClause = "AND s.mods = ?";
        params.push(mods);
      } else {
        modsClause = "AND s.mods & ? = ?";
        params.push(mods, mods);
      }
    }

    params.push(limit);

    const scores = await fetchAll<Record<string, unknown>>(
      `SELECT s.map_md5, s.id, s.score, s.pp, s.acc, s.max_combo,
              s.mods, s.n300, s.n100, s.n50, s.nmiss, s.ngeki, s.nkatu,
              s.grade, s.status, s.mode, s.play_time, s.time_elapsed,
              s.userid, s.perfect, s.clock_rate,
              u.name AS player_name, u.country AS player_country,
              c.id AS clan_id, c.name AS clan_name, c.tag AS clan_tag,
              l.mods_json
       FROM scores s
       INNER JOIN users u ON u.id = s.userid
       LEFT JOIN clans c ON c.id = u.clan_id
       LEFT JOIN lazer_scores l ON l.score_id = s.id
       WHERE s.map_md5 = ? AND s.mode = ? AND s.status = 2
             AND u.priv & ${Privileges.UNRESTRICTED} != 0
             ${modsClause}
       ORDER BY ${orderBy}
       LIMIT ${limit}`,
      params.slice(0, -1)
    );

    return reply.send({
      status: "success",
      scores: scores.map((s) => {
        const modsJson = s.mods_json ? JSON.parse(s.mods_json as string) : null;
        const result: Record<string, unknown> = { ...s };
        delete result.mods_json;
        if (modsJson) {
          result.mods_json = modsJson;
        } else {
          result.mods_json = null;
          result.mods_readable = modsToString(Number(s.mods));
        }
        return result;
      }),
    });
  });

  // GET /get_score_info
  app.get("/get_score_info", async (req, reply) => {
    const { id } = req.query as { id?: string };

    if (!id) {
      return reply.send({ status: "error", message: "Must provide id." });
    }

    const score = await fetchScoreById(Number(id));
    if (!score) {
      return reply.send({ status: "error", message: "Score not found." });
    }

    const lzRow = await fetchOne<{ mods_json: string | null }>(
      "SELECT mods_json FROM lazer_scores WHERE score_id = ?",
      [score.id]
    );

    const modsJson = lzRow?.mods_json ? JSON.parse(lzRow.mods_json) : null;
    const scoreResult: Record<string, unknown> = { ...score };
    if (modsJson) {
      scoreResult.mods_json = modsJson;
      delete scoreResult.mods;
    } else {
      scoreResult.mods_json = null;
    }

    return reply.send({
      status: "success",
      score: scoreResult,
    });
  });

  // GET /get_play
  app.get("/get_play", async (req, reply) => {
    const { id, include_headers } = req.query as { id?: string; include_headers?: string };

    if (!id) {
      return reply.send({ status: "error", message: "Must provide id." });
    }

    const score = await fetchScoreById(Number(id));
    if (!score) {
      return reply.send({ status: "error", message: "Score not found." });
    }

    const replayPath = path.join(REPLAYS_PATH, `${score.id}.osr`);

    try {
      const data = await readFile(replayPath);

      if (include_headers === "true" || include_headers === "1") {
        reply.header("Content-Type", "application/octet-stream");
        reply.header("Content-Disposition", `attachment; filename="${score.id}.osr"`);
        return reply.send(data);
      }

      reply.header("Content-Type", "application/octet-stream");
      return reply.send(data);
    } catch {
      return reply.send({ status: "error", message: "Replay file not found." });
    }
  });

  // GET /get_leaderboard
  app.get("/get_leaderboard", async (req, reply) => {
    const query = req.query as {
      mode?: string;
      limit?: string;
      offset?: string;
      country?: string;
      sort?: string;
    };

    const mode = query.mode !== undefined ? Number(query.mode) : 0;
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const country = query.country;
    const sort = query.sort ?? "pp";

    if (INVALID_MODES.has(mode)) {
      return reply.send({ status: "error", message: "Invalid mode." });
    }

    const rows = await fetchAll<Record<string, unknown>>(
      `SELECT u.id AS player_id, u.name, u.country, u.latest_activity,
              s.tscore, s.rscore, s.pp, s.plays, s.playtime, s.acc, s.max_combo, s.xp,
              s.xh_count, s.x_count, s.sh_count, s.s_count, s.a_count,
              c.id AS clan_id, c.name AS clan_name, c.tag AS clan_tag
       FROM stats s
       LEFT JOIN users u ON u.id = s.id
       LEFT JOIN clans c ON c.id = u.clan_id
       WHERE s.mode = ? AND u.priv & ${Privileges.UNRESTRICTED} != 0 AND s.pp > 0
       ${country ? "AND u.country = ?" : ""}
       ORDER BY s.${sort} DESC
       LIMIT ${offset}, ${limit}`,
      country ? [mode, country] : [mode]
    );

    const leaderboard = rows.map((r) => ({ ...r, acc: r3(r.acc) }));
    const total = leaderboard.length;

    if (total === 0) {
      return reply.send({ status: "success", leaderboard: [] });
    }

    return reply.send({ status: "success", leaderboard });
  });

  // GET /get_clan
  app.get("/get_clan", async (req, reply) => {
    const { id } = req.query as { id?: string };

    if (!id) {
      return reply.send({ status: "error", message: "Must provide id." });
    }

    const clan = await fetchClanById(Number(id));
    if (!clan) {
      return reply.send({ status: "error", message: "Clan not found." });
    }

    const members = await fetchUsersByClan(clan.id);

    const clanPrivToRank = (priv: number) =>
      (["Member", "Officer", "Owner"] as const)[priv - 1] ?? "Member";

    const ownerMember = members.find((m) => m.id === clan.owner);

    return reply.send({
      id: clan.id,
      name: clan.name,
      tag: clan.tag,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        country: m.country,
        rank: clanPrivToRank(m.clan_priv),
      })),
      owner: ownerMember
        ? {
            id: ownerMember.id,
            name: ownerMember.name,
            country: ownerMember.country,
            rank: "Owner",
          }
        : { id: clan.owner, rank: "Owner" },
    });
  });

  // GET /get_mappool
  app.get("/get_mappool", async (req, reply) => {
    const { id } = req.query as { id?: string };

    if (!id) {
      return reply.send({ status: "error", message: "Must provide id." });
    }

    const pool = await fetchPoolById(Number(id));
    if (!pool) {
      return reply.send({ status: "error", message: "Pool not found." });
    }

    const poolMaps = await fetchPoolMaps(pool.id);

    const creatorUser = await fetchUserById(pool.created_by);
    let createdBy: Record<string, unknown> = { id: pool.created_by };
    if (creatorUser) {
      let creatorClan: { id: number; name: string; tag: string; members: number } | null = null;
      if (creatorUser.clan_id) {
        const cc = await fetchClanById(creatorUser.clan_id);
        if (cc) {
          const ccMembers = await fetchUsersByClan(cc.id);
          creatorClan = { id: cc.id, name: cc.name, tag: cc.tag, members: ccMembers.length };
        }
      }
      createdBy = {
        id: creatorUser.id,
        name: creatorUser.name,
        country: creatorUser.country,
        clan: creatorClan,
        online: false,
      };
    }

    const mapsDict: Record<string, unknown> = {};
    for (const pm of poolMaps) {
      const bmap = await fetchBeatmapById(pm.map_id);
      if (bmap) {
        const key = `${modsToString(pm.mods)}${pm.slot}`;
        mapsDict[key] = beatmapAsDict(bmap);
      }
    }

    return reply.send({
      id: pool.id,
      name: pool.name,
      created_at: pool.created_at,
      created_by: createdBy,
      maps: mapsDict,
    });
  });

  // GET /changelog
  app.get("/changelog", async (req, reply) => {
    const { type, limit: limitStr } = req.query as { type?: string; limit?: string };

    const limit = Math.min(Math.max(Number(limitStr) || 25, 1), 100);
    const params: unknown[] = [];
    let typeClause = "";

    if (type) {
      typeClause = "WHERE type = ?";
      params.push(type);
    }

    params.push(limit);

    const entries = await fetchAll<Record<string, unknown>>(
      `SELECT user_id, description, category, date
       FROM changelog
       ${typeClause}
       ORDER BY date DESC
       LIMIT ${limit}`,
      params.slice(0, -1)
    );

    return reply.send({ status: "success", type: type ? Number(type) : null, changelog: entries });
  });

  // GET /get_player_history
  app.get("/get_player_history", async (req, reply) => {
    const query = req.query as {
      id?: string;
      name?: string;
      mode?: string;
      type?: string;
      limit?: string;
    };

    let user: User | null = null;
    if (query.id) {
      user = await fetchUserById(Number(query.id));
    } else if (query.name) {
      user = await fetchUserByName(query.name);
    } else {
      return reply.send({ status: "error", message: "Must provide id or name." });
    }

    if (!user) {
      return reply.send({ status: "error", message: "Player not found." });
    }

    if (!(user.priv & Privileges.UNRESTRICTED)) {
      return reply.send({ status: "error", message: "Player is restricted." });
    }

    const mode = query.mode !== undefined ? Number(query.mode) : 0;
    const historyType = query.type ?? "pp";
    const limit = Math.min(Math.max(Number(query.limit) || 89, 1), 365);

    switch (historyType) {
      case "pp": {
        const history = await fetchPPHistory(user.id, mode, limit);
        const current = await fetchCurrentPP(user.id, mode);
        const reversed = [...history].reverse();
        if (current) reversed.push({ user_id: user.id, mode, ...current });
        return reply.send({
          status: "success",
          data: {
            user_id: user.id,
            mode,
            captures: reversed.map((c) => ({
              captured_at: c.captured_at instanceof Date ? c.captured_at.toISOString() : c.captured_at,
              pp: c.pp,
            })),
          },
        });
      }
      case "rank": {
        const history = await fetchRankHistory(user.id, mode, limit);
        const current = await fetchCurrentRankWithCountry(user.id, mode, user.country);
        const reversed = [...history].reverse();
        if (current) reversed.push({ user_id: user.id, mode, captured_at: current.captured_at, rank: current.rank, c_rank: current.c_rank });
        return reply.send({
          status: "success",
          data: {
            user_id: user.id,
            mode,
            captures: reversed.map((c) => ({
              captured_at: c.captured_at instanceof Date ? c.captured_at.toISOString() : c.captured_at,
              overall: c.rank,
              country: c.c_rank,
            })),
          },
        });
      }
      case "peak": {
        const peak = await fetchPeakRank(user.id, mode);
        if (!peak) return reply.send({ status: "error", message: "Rank Capture not found." });
        return reply.send({
          status: "success",
          data: {
            user_id: user.id,
            mode,
            captured_at: peak.captured_at instanceof Date ? peak.captured_at.toISOString() : peak.captured_at,
            rank: peak.rank,
          },
        });
      }
      default:
        return reply.send({ status: "error", message: "Invalid history type. Use pp, rank, or peak." });
    }
  });

  // GET /pp
  app.get("/pp", async (req, reply) => {
    const query = req.query as {
      id?: string;
      name?: string;
      mode?: string;
      target_pp?: string;
    };

    let user: User | null = null;
    if (query.id) {
      user = await fetchUserById(Number(query.id));
    } else if (query.name) {
      user = await fetchUserByName(query.name);
    } else {
      return reply.send({ status: "error", message: "Must provide id or name." });
    }

    if (!user) {
      return reply.send({ status: "error", message: "Player not found." });
    }

    const mode = query.mode !== undefined ? Number(query.mode) : 0;
    const targetPP = Number(query.target_pp);

    if (!targetPP || targetPP <= 0) {
      return reply.send({ status: "error", message: "Must provide a valid target_pp." });
    }

    // Fetch top scores for pp calculation
    const scores = await fetchAll<{ pp: number }>(
      `SELECT pp FROM scores
       WHERE userid = ? AND mode = ? AND status = 2
       ORDER BY pp DESC
       LIMIT 100`,
      [user.id, mode]
    );

    if (!scores.length) {
      return reply.send({
        current_pp: 0,
        target_pp: targetPP,
        pp_needed: targetPP,
      });
    }

    const count = scores.length;
    const weightedPP = scores.reduce((sum, s, i) => sum + s.pp * Math.pow(0.95, i), 0);
    const bonus = 416.6667 * (1 - Math.pow(0.9994, count));
    const currentPP = weightedPP + bonus;

    const bonusNext = 416.6667 * (1 - Math.pow(0.9994, count + 1));
    const ppNeeded = Math.max(0, targetPP - 0.95 * weightedPP - bonusNext);

    return reply.send({
      current_pp: Math.round(currentPP * 100) / 100,
      target_pp: targetPP >= currentPP ? Math.round(targetPP * 100) / 100 : "already at or above target pp",
      pp_needed: Math.round(ppNeeded * 100) / 100,
    });
  });
}
