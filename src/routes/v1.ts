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
    acc: s.acc,
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
      results: rows.map((u) => ({
        id: u.id,
        name: u.name,
        country: u.country,
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

    if (requestedScope === "info" || requestedScope === "all") {
      result.player = userAsDict(user);
    }

    if (requestedScope === "stats" || requestedScope === "all") {
      const stats = await fetchStatsByPlayer(user.id);
      const redis = getRedis();

      const statsWithRank = await Promise.all(
        stats.map(async (s) => {
          const globalRank = await redis.zrevrank(
            `bancho:leaderboard:${s.mode}`,
            String(user!.id)
          );
          const countryRank = await redis.zrevrank(
            `bancho:leaderboard:${s.mode}:${user!.country.toLowerCase()}`,
            String(user!.id)
          );

          return {
            ...statAsDict(s as unknown as Record<string, unknown>),
            rank: globalRank !== null ? globalRank + 1 : 0,
            country_rank: countryRank !== null ? countryRank + 1 : 0,
          };
        })
      );

      result.stats = statsWithRank;
    }

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
       LIMIT ?`,
      params
    );

    return reply.send({
      status: "success",
      scores: scores.map((s) => ({
        ...s,
        mods_str: modsToString(Number(s.mods)),
      })),
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
      `SELECT s.map_md5, COUNT(*) AS plays,
              m.id AS map_id, m.set_id, m.artist, m.title, m.version, m.creator
       FROM scores s
       INNER JOIN maps m ON m.md5 = s.map_md5
       WHERE s.userid = ? AND s.mode = ?
       GROUP BY s.map_md5
       ORDER BY plays DESC
       LIMIT ?`,
      [user.id, modeVal, limit]
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
      `SELECT s.id, s.map_md5, s.score, s.pp, s.acc, s.max_combo,
              s.mods, s.n300, s.n100, s.n50, s.nmiss, s.ngeki, s.nkatu,
              s.grade, s.status, s.mode, s.play_time, s.time_elapsed,
              s.userid, s.perfect, s.pinned, s.clock_rate,
              u.name AS player_name, u.country AS player_country,
              l.mods_json
       FROM scores s
       INNER JOIN users u ON u.id = s.userid
       LEFT JOIN lazer_scores l ON l.score_id = s.id
       WHERE s.map_md5 = ? AND s.mode = ? AND s.status = 2
             AND u.priv & ${Privileges.UNRESTRICTED} != 0
             ${modsClause}
       ORDER BY ${orderBy}
       LIMIT ?`,
      params
    );

    return reply.send({
      status: "success",
      scores: scores.map((s) => ({
        ...s,
        mods_str: modsToString(Number(s.mods)),
      })),
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

    return reply.send({
      status: "success",
      score: {
        ...score,
        mods_str: modsToString(score.mods),
      },
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

  // GET /get_match
  app.get("/get_match", async (req, reply) => {
    return reply.send({ status: "error", message: "Match not found." });
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

    const redis = getRedis();
    const lbKey = country
      ? `bancho:leaderboard:${mode}:${country.toLowerCase()}`
      : `bancho:leaderboard:${mode}`;

    const totalPlayers = await redis.zcard(lbKey);
    const userIds = await redis.zrevrange(lbKey, offset, offset + limit - 1);

    if (!userIds.length) {
      return reply.send({ status: "success", leaderboard: [] });
    }

    const leaderboard = await Promise.all(
      userIds.map(async (uid, idx) => {
        const user = await fetchUserById(Number(uid));
        if (!user) return null;

        const stats = await fetchStatsByPlayer(user.id);
        const modeStat = stats.find((s) => s.mode === mode);

        const rank = offset + idx + 1;

        return {
          player: {
            id: user.id,
            name: user.name,
            country: user.country,
            clan_id: user.clan_id,
            clan_priv: user.clan_priv,
          },
          stats: modeStat
            ? statAsDict(modeStat as unknown as Record<string, unknown>)
            : null,
          rank,
        };
      })
    );

    return reply.send({
      status: "success",
      leaderboard: leaderboard.filter(Boolean),
    });
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

    return reply.send({
      status: "success",
      clan: {
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        owner: clan.owner,
        created_at: clan.created_at,
        members: members.map((m) => ({
          id: m.id,
          name: m.name,
          country: m.country,
          clan_priv: m.clan_priv,
        })),
      },
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

    const maps = await Promise.all(
      poolMaps.map(async (pm) => {
        const bmap = await fetchBeatmapById(pm.map_id);
        return {
          slot: pm.slot,
          mods: pm.mods,
          mods_str: modsToString(pm.mods),
          map: bmap ? beatmapAsDict(bmap) : null,
        };
      })
    );

    return reply.send({
      status: "success",
      pool: {
        id: pool.id,
        name: pool.name,
        created_at: pool.created_at,
        created_by: pool.created_by,
        maps,
      },
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
      `SELECT id, type, message, created_at
       FROM changelog
       ${typeClause}
       ORDER BY created_at DESC
       LIMIT ?`,
      params
    );

    return reply.send({ status: "success", changelog: entries });
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
        const entries = current ? [current, ...history] : history;
        return reply.send({ status: "success", history: entries });
      }
      case "rank": {
        const history = await fetchRankHistory(user.id, mode, limit);
        const current = await fetchCurrentRankWithCountry(user.id, mode, user.country);
        const entries = current
          ? [{ user_id: user.id, mode, ...current }, ...history]
          : history;
        return reply.send({ status: "success", history: entries });
      }
      case "peak": {
        const peak = await fetchPeakRank(user.id, mode);
        return reply.send({ status: "success", peak: peak ?? null });
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
        status: "success",
        pp_needed: targetPP,
        message: "No scores found for this mode.",
      });
    }

    // Calculate weighted pp
    let currentWeightedPP = 0;
    for (let i = 0; i < scores.length; i++) {
      currentWeightedPP += scores[i].pp * Math.pow(0.95, i);
    }

    // Calculate what pp a new score would need to reach target
    // If a new #1 score is set, it shifts everything down by 1
    let ppAfterShift = 0;
    for (let i = 0; i < scores.length; i++) {
      ppAfterShift += scores[i].pp * Math.pow(0.95, i + 1);
    }

    const ppNeeded = (targetPP - ppAfterShift) / Math.pow(0.95, 0);

    return reply.send({
      status: "success",
      current_pp: Math.round(currentWeightedPP * 100) / 100,
      target_pp: targetPP,
      pp_needed: Math.round(Math.max(0, ppNeeded) * 100) / 100,
    });
  });
}
