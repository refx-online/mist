import { FastifyInstance } from "fastify";
import { fetchAll } from "../../db";

export function registerChangelog(app: FastifyInstance) {
  app.get("/changelog", async (req, reply) => {
    const { type, limit: limitStr } = req.query as { type?: string; limit?: string };

    const limit = Math.min(Math.max(Number(limitStr) || 25, 1), 100);
    const params: unknown[] = [];
    let typeClause = "";

    if (type) {
      typeClause = "WHERE type = ?";
      params.push(type);
    }

    const entries = await fetchAll<Record<string, unknown>>(
      `SELECT user_id, description, category, date
       FROM changelog
       ${typeClause}
       ORDER BY date DESC
       LIMIT ${limit}`,
      params
    );

    return reply.send({ status: "success", type: type ? Number(type) : null, changelog: entries });
  });
}
