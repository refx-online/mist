export enum GameMode {
  VANILLA_OSU = 0,
  VANILLA_TAIKO = 1,
  VANILLA_CATCH = 2,
  VANILLA_MANIA = 3,
  RELAX_OSU = 4,
  RELAX_TAIKO = 5,
  RELAX_CATCH = 6,
  AUTOPILOT_OSU = 7,
  CHEAT_OSU = 8,
  CHEAT_TAIKO = 9,
  CHEAT_CATCH = 10,
  CHEAT_MANIA = 11,
  CHEAT_RX_OSU = 12,
  CHEAT_RX_TAIKO = 13,
  CHEAT_RX_CATCH = 14,
  CHEAT_AP_OSU = 15,
}

// dense 0-15 now: anything outside the enum is invalid.
// rx excludes mania, autopilot is std-only.
export function isInvalidMode(mode: number): boolean {
  return !Number.isInteger(mode) || mode < 0 || mode > 15;
}

// per-mode rank status packed into one number: 3 bits per mode id (0-15).
// statuses aren't contiguous (-2 unused): -3->0, -1->1, 0->2, 1->3,
// 2->4, 3->5, 4->6, 5->7. mirrors forlorn.
// (bigint: JS bitwise ops are 32-bit, masks are 48-bit.)
const STATUS_CODES = [-3, -1, 0, 1, 2, 3, 4, 5];

export function statusAt(mask: number | bigint, mode: number): number {
  if (!Number.isInteger(mode) || mode < 0 || mode > 15) return 0; // Pending
  return STATUS_CODES[Number((BigInt(mask) >> BigInt(mode * 3)) & BigInt(7))];
}

export function withStatus(mask: number | bigint, mode: number, status: number): number {
  if (!Number.isInteger(mode) || mode < 0 || mode > 15) return Number(mask);
  const m = BigInt(mask);
  let code = STATUS_CODES.indexOf(status);
  if (code < 0) code = 2; // Pending
  const shift = BigInt(mode * 3);
  return Number((m & ~(BigInt(7) << shift)) | (BigInt(code) << shift));
}

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
