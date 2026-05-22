import { FastifyInstance } from "fastify";
import { fetchUsersByClan } from "../../repositories/users";
import { fetchClanById } from "../../repositories/clans";

export function registerGetClan(app: FastifyInstance) {
  app.get("/get_clan", async (req, reply) => {
    const { id } = req.query as { id?: string };

    if (!id) {
      return reply.send({ status: "error", message: "Must provide id." });
    }

    const clan = await fetchClanById(Number(id));
    if (!clan) {
      return reply.send({ status: "error", message: "Clan not found." });
    }

    const members = await fetchUsersByClan(clan.id);

    const clanPrivToRank = (priv: number) =>
      (["Member", "Officer", "Owner"] as const)[priv - 1] ?? "Member";

    const ownerMember = members.find((m) => m.id === clan.owner);

    return reply.send({
      id: clan.id,
      name: clan.name,
      tag: clan.tag,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        country: m.country,
        rank: clanPrivToRank(m.clan_priv),
      })),
      owner: ownerMember
        ? { id: ownerMember.id, name: ownerMember.name, country: ownerMember.country, rank: "Owner" }
        : { id: clan.owner, rank: "Owner" },
    });
  });
}
