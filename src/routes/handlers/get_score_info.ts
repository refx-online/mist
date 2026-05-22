import { FastifyInstance } from "fastify";
import { fetchOne } from "../../db";
import { fetchScoreById } from "../../repositories/scores";

export function registerGetScoreInfo(app: FastifyInstance) {
  app.get("/get_score_info", async (req, reply) => {
    const { id } = req.query as { id?: string };

    if (!id) {
      return reply.send({ status: "error", message: "Must provide id." });
    }

    const score = await fetchScoreById(Number(id));
    if (!score) {
      return reply.send({ status: "error", message: "Score not found." });
    }

    const lzRow = await fetchOne<{ mods_json: string | null }>(
      "SELECT mods_json FROM lazer_scores WHERE score_id = ?",
      [score.id]
    );

    const modsJson = lzRow?.mods_json ? JSON.parse(lzRow.mods_json) : null;
    const scoreResult: Record<string, unknown> = { ...score };
    if (modsJson) {
      scoreResult.mods_json = modsJson;
      delete scoreResult.mods;
    } else {
      scoreResult.mods_json = null;
    }

    return reply.send({ status: "success", score: scoreResult });
  });
}
