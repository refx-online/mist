export enum GameMode {
  VANILLA_OSU = 0,
  VANILLA_TAIKO = 1,
  VANILLA_CATCH = 2,
  VANILLA_MANIA = 3,
  RELAX_OSU = 4,
  RELAX_TAIKO = 5,
  RELAX_CATCH = 6,
  AUTOPILOT_OSU = 8,
  CHEAT_OSU = 12,
  CHEAT_TAIKO = 13,
  CHEAT_CATCH = 14,
  CHEAT_MANIA = 15,
  CHEAT_RX_OSU = 21,
  CHEAT_RX_TAIKO = 22,
  CHEAT_RX_CATCH = 23,
  CHEAT_AP_OSU = 24,
}

// every mode id not in the enum (7, 9-11, 16-20, 25+) is invalid.
// rx excludes mania, autopilot is std-only.
export const INVALID_MODES = new Set([7, 9, 10, 11, 16, 17, 18, 19, 20]);

export const VALID_SCORE_MODES = [
  GameMode.VANILLA_OSU,
  GameMode.VANILLA_TAIKO,
  GameMode.VANILLA_CATCH,
  GameMode.VANILLA_MANIA,
  GameMode.RELAX_OSU,
  GameMode.RELAX_TAIKO,
  GameMode.RELAX_CATCH,
  GameMode.AUTOPILOT_OSU,
  GameMode.CHEAT_OSU,
  GameMode.CHEAT_TAIKO,
  GameMode.CHEAT_CATCH,
  GameMode.CHEAT_MANIA,
  GameMode.CHEAT_RX_OSU,
  GameMode.CHEAT_RX_TAIKO,
  GameMode.CHEAT_RX_CATCH,
  GameMode.CHEAT_AP_OSU,
];
