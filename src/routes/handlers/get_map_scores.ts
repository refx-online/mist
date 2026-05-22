import { FastifyInstance } from "fastify";
import { fetchAll } from "../../db";
import { Privileges } from "../../constants/privileges";
import { modsToString } from "../../constants/mods";
import { fetchBeatmapByMd5, fetchBeatmapById } from "../../repositories/maps";
import { parseMods } from "../utils";

export function registerGetMapScores(app: FastifyInstance) {
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

    const orderBy = scope === "recent" ? "s.play_time DESC" : "s.pp DESC, s.score DESC";

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
      params
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
}
