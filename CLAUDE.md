# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm install          # install dependencies
npm run build        # compile TypeScript to dist/
npm run start        # run compiled output
npm run dev          # run with ts-node (development)
```

## Docker

```bash
docker build -t mist .
docker run --env-file .env -p 7273:7273 mist
```

## Architecture

TypeScript rewrite of the v1 API from meat-my-beat-i (Python/FastAPI). Serves as the public developer API for the refx osu! private server.

- **Framework**: Fastify 4 + `@fastify/cors` v8 (must be v8, not v9+, for Fastify 4 compatibility)
- **Database**: MySQL via mysql2/promise (connection pool)
- **Cache**: Redis via ioredis (used for rank lookups in `get_player_info`)
- **Entry**: `src/index.ts` registers the v1 router at `/v1`
- **Logging**: pino-pretty in dev (`NODE_ENV !== "production"`), structured JSON in prod

### Layout

- `src/routes/v1.ts` — Wiring only: registers all handlers under `/v1`
- `src/routes/handlers/` — One file per endpoint (e.g. `get_player_info.ts`, `get_map_scores.ts`)
- `src/routes/utils.ts` — Shared helpers: `parseMods`, `userAsDict`, `statAsDict`, `r2`, `r3`, `fmtDatetime`, `REPLAYS_PATH`
- `src/repositories/` — Data access layer, one file per domain: users, maps, scores, stats, clans, history, tourney
- `src/constants/` — Enums for gamemodes, mods (with string conversion), privileges
- `src/db.ts` — MySQL pool singleton with `fetchOne`/`fetchAll` helpers
- `src/redis.ts` — Redis client singleton

### Key Details

- Redis leaderboard keys: `bancho:leaderboard:{mode}` and `bancho:leaderboard:{mode}:{country}`. Mode 7 (rx!mania) maps to redis key 8 for rank lookups in `get_player_info`.
- Scores join with `lazer_scores` table to get `mods_json`. When `mods_json` is present, omit `mods` integer and `mods_readable`; when absent, set `mods_json: null` and include `mods_readable`.
- Mods can be parsed as integer or string (e.g. "HDDT"), with `=` prefix for strong equality and `~` for weak. Use `parseMods()` from `utils.ts`.
- **`LIMIT ?` as a prepared statement parameter fails with mysql2** (`ER_WRONG_ARGUMENTS`). Always interpolate bounds-checked limit/offset values directly into the SQL string (e.g. `LIMIT ${limit}`).
- Float fields (`acc`, `pp`, `xp_gained`) must be rounded to match Python's orjson output: `r2()` for 2dp, `r3()` for 3dp.
- Datetime fields must be formatted as `YYYY-MM-DDTHH:MM:SS` (no timezone suffix) via `fmtDatetime()`.
- Adding a new endpoint: create `src/routes/handlers/<name>.ts` exporting `registerXxx(app)`, then add one line to `v1.ts`.
