import { FastifyInstance } from "fastify";
import { getRedis } from "../../redis";
import { fetchUserById, fetchUserByName } from "../../repositories/users";
import { fetchStatsByPlayer } from "../../repositories/stats";
import { userAsDict, statAsDict } from "../utils";

export function registerGetPlayerInfo(app: FastifyInstance) {
  app.get("/get_player_info", async (req, reply) => {
    const { id, name, scope } = req.query as { id?: string; name?: string; scope?: string };

    let user = null;
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
}
