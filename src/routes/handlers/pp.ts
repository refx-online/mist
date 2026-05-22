import { FastifyInstance } from "fastify";
import { fetchAll } from "../../db";
import { fetchUserById, fetchUserByName } from "../../repositories/users";

export function registerPP(app: FastifyInstance) {
  app.get("/pp", async (req, reply) => {
    const query = req.query as {
      id?: string;
      name?: string;
      mode?: string;
      target_pp?: string;
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

    const mode = query.mode !== undefined ? Number(query.mode) : 0;
    const targetPP = Number(query.target_pp);

    if (!targetPP || targetPP <= 0) {
      return reply.send({ status: "error", message: "Must provide a valid target_pp." });
    }

    const scores = await fetchAll<{ pp: number }>(
      `SELECT pp FROM scores
       WHERE userid = ? AND mode = ? AND status = 2
       ORDER BY pp DESC
       LIMIT 100`,
      [user.id, mode]
    );

    if (!scores.length) {
      return reply.send({ current_pp: 0, target_pp: targetPP, pp_needed: targetPP });
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
