import { FastifyInstance } from "fastify";
import { fetchUserById, fetchUserByName } from "../../repositories/users";
import { Privileges } from "../../constants/privileges";
import {
  fetchPPHistory,
  fetchCurrentPP,
  fetchRankHistory,
  fetchPeakRank,
  fetchCurrentRankWithCountry,
} from "../../repositories/history";

export function registerGetPlayerHistory(app: FastifyInstance) {
  app.get("/get_player_history", async (req, reply) => {
    const query = req.query as {
      id?: string;
      name?: string;
      mode?: string;
      type?: string;
      limit?: string;
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
}
