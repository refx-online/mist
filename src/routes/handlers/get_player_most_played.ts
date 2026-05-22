import { FastifyInstance } from "fastify";
import { fetchAll } from "../../db";
import { fetchUserById, fetchUserByName } from "../../repositories/users";

export function registerGetPlayerMostPlayed(app: FastifyInstance) {
  app.get("/get_player_most_played", async (req, reply) => {
    const { id, name, limit: limitStr, mode } = req.query as {
      id?: string;
      name?: string;
      limit?: string;
      mode?: string;
    };

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
}
