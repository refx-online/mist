import { FastifyInstance } from "fastify";
import { fetchBeatmapByMd5, fetchBeatmapById, beatmapAsDict } from "../../repositories/maps";

export function registerGetMapInfo(app: FastifyInstance) {
  app.get("/get_map_info", async (req, reply) => {
    const { id, md5 } = req.query as { id?: string; md5?: string };

    let bmap;
    if (md5) {
      bmap = await fetchBeatmapByMd5(md5);
    } else if (id) {
      bmap = await fetchBeatmapById(Number(id));
    } else {
      return reply.send({ status: "error", message: "Must provide id or md5." });
    }

    if (!bmap) {
      return reply.send({ status: "error", message: "Beatmap not found." });
    }

    return reply.send({ status: "success", map: beatmapAsDict(bmap) });
  });
}
