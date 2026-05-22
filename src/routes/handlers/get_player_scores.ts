import { FastifyInstance } from "fastify";
import { fetchAll } from "../../db";
import { INVALID_MODES } from "../../constants/gamemodes";
import { modsToString } from "../../constants/mods";
import { fetchUserById, fetchUserByName } from "../../repositories/users";
import { fetchBeatmapByMd5, beatmapAsDict } from "../../repositories/maps";
import { fetchClanById } from "../../repositories/clans";
import { parseMods, r2, r3, fmtDatetime } from "../utils";

export function registerGetPlayerScores(app: FastifyInstance) {
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

    let user = null;
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
      default:
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
      params
    );

    let clan: { id: number; name: string; tag: string } | null = null;
    if (user.clan_id) {
      const clanRow = await fetchClanById(user.clan_id);
      if (clanRow) clan = { id: clanRow.id, name: clanRow.name, tag: clanRow.tag };
    }

    return reply.send({
      status: "success",
      scores: await Promise.all(
        scores.map(async (s) => {
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
        })
      ),
      player: { id: user.id, name: user.name, clan },
    });
  });
}
