import { FastifyInstance } from "fastify";
import { fetchAll } from "../../db";
import { Privileges } from "../../constants/privileges";
import { User } from "../../repositories/users";

export function registerSearchPlayers(app: FastifyInstance) {
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
      result: rows.map((u) => ({ id: u.id, name: u.name })),
    });
  });
}
