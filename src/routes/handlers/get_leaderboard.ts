import { FastifyInstance } from "fastify";
import { fetchAll } from "../../db";
import { INVALID_MODES } from "../../constants/gamemodes";
import { Privileges } from "../../constants/privileges";
import { r3 } from "../utils";

export function registerGetLeaderboard(app: FastifyInstance) {
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

    if (leaderboard.length === 0) {
      return reply.send({ status: "success", leaderboard: [] });
    }

    return reply.send({ status: "success", leaderboard });
  });
}
