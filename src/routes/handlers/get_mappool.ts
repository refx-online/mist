import { FastifyInstance } from "fastify";
import { modsToString } from "../../constants/mods";
import { fetchUserById, fetchUsersByClan } from "../../repositories/users";
import { fetchBeatmapById, beatmapAsDict } from "../../repositories/maps";
import { fetchClanById } from "../../repositories/clans";
import { fetchPoolById, fetchPoolMaps } from "../../repositories/tourney";

export function registerGetMappool(app: FastifyInstance) {
  app.get("/get_mappool", async (req, reply) => {
    const { id } = req.query as { id?: string };

    if (!id) {
      return reply.send({ status: "error", message: "Must provide id." });
    }

    const pool = await fetchPoolById(Number(id));
    if (!pool) {
      return reply.send({ status: "error", message: "Pool not found." });
    }

    const poolMaps = await fetchPoolMaps(pool.id);

    const creatorUser = await fetchUserById(pool.created_by);
    let createdBy: Record<string, unknown> = { id: pool.created_by };
    if (creatorUser) {
      let creatorClan: { id: number; name: string; tag: string; members: number } | null = null;
      if (creatorUser.clan_id) {
        const cc = await fetchClanById(creatorUser.clan_id);
        if (cc) {
          const ccMembers = await fetchUsersByClan(cc.id);
          creatorClan = { id: cc.id, name: cc.name, tag: cc.tag, members: ccMembers.length };
        }
      }
      createdBy = {
        id: creatorUser.id,
        name: creatorUser.name,
        country: creatorUser.country,
        clan: creatorClan,
        online: false,
      };
    }

    const mapsDict: Record<string, unknown> = {};
    for (const pm of poolMaps) {
      const bmap = await fetchBeatmapById(pm.map_id);
      if (bmap) {
        const key = `${modsToString(pm.mods)}${pm.slot}`;
        mapsDict[key] = beatmapAsDict(bmap);
      }
    }

    return reply.send({
      id: pool.id,
      name: pool.name,
      created_at: pool.created_at,
      created_by: createdBy,
      maps: mapsDict,
    });
  });
}
