import { FastifyInstance } from "fastify";

import { registerSearchPlayers } from "./handlers/search_players";
import { registerGetPlayerInfo } from "./handlers/get_player_info";
import { registerGetPlayerScores } from "./handlers/get_player_scores";
import { registerGetPlayerMostPlayed } from "./handlers/get_player_most_played";
import { registerGetMapInfo } from "./handlers/get_map_info";
import { registerGetMapScores } from "./handlers/get_map_scores";
import { registerGetScoreInfo } from "./handlers/get_score_info";
import { registerGetPlay } from "./handlers/get_play";
import { registerGetLeaderboard } from "./handlers/get_leaderboard";
import { registerGetClan } from "./handlers/get_clan";
import { registerGetMappool } from "./handlers/get_mappool";
import { registerChangelog } from "./handlers/changelog";
import { registerGetPlayerHistory } from "./handlers/get_player_history";
import { registerPP } from "./handlers/pp";

export async function v1Router(app: FastifyInstance) {
  registerSearchPlayers(app);
  registerGetPlayerInfo(app);
  registerGetPlayerScores(app);
  registerGetPlayerMostPlayed(app);
  registerGetMapInfo(app);
  registerGetMapScores(app);
  registerGetScoreInfo(app);
  registerGetPlay(app);
  registerGetLeaderboard(app);
  registerGetClan(app);
  registerGetMappool(app);
  registerChangelog(app);
  registerGetPlayerHistory(app);
  registerPP(app);
}
