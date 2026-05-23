import { FastifyInstance } from "fastify";
import { readFile } from "fs/promises";
import path from "path";
import { fetchScoreById } from "../../repositories/scores";
import { REPLAYS_PATH } from "../utils";

/// DEPRECATED
export function registerGetPlay(app: FastifyInstance) {
  app.get("/get_play", async (req, reply) => {
    const { id, include_headers } = req.query as { id?: string; include_headers?: string };

    if (!id) {
      return reply.send({ status: "error", message: "Must provide id." });
    }

    const score = await fetchScoreById(Number(id));
    if (!score) {
      return reply.send({ status: "error", message: "Score not found." });
    }

    const replayPath = path.join(REPLAYS_PATH, `${score.id}.osr`);

    try {
      const data = await readFile(replayPath);

      if (include_headers === "true" || include_headers === "1") {
        reply.header("Content-Type", "application/octet-stream");
        reply.header("Content-Disposition", `attachment; filename="${score.id}.osr"`);
        return reply.send(data);
      }

      reply.header("Content-Type", "application/octet-stream");
      return reply.send(data);
    } catch {
      return reply.send({ status: "error", message: "Replay file not found." });
    }
  });
}
