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

- **Framework**: Fastify
- **Database**: MySQL via mysql2/promise (connection pool)
- **Cache/Leaderboards**: Redis via ioredis
- **Entry**: `src/index.ts` registers the v1 router at `/v1`

### Layout

- `src/routes/v1.ts` — All v1 endpoint handlers (search, player info/scores/history, maps, leaderboards, clans, tourney pools, replays, changelog, pp calculator)
- `src/repositories/` — Data access layer (one file per domain: users, maps, scores, stats, clans, history, tourney)
- `src/constants/` — Enums for gamemodes, mods (with string conversion), privileges
- `src/types/` — Shared interfaces (beatmap)
- `src/db.ts` — MySQL pool singleton with `fetchOne`/`fetchAll` helpers
- `src/redis.ts` — Redis client singleton

### Key Details

- `get_player_count` and `get_player_status` are NOT in this service (handled by meat-my-beat-i which has in-memory player sessions)
- Redis leaderboard keys: `bancho:leaderboard:{mode}` and `bancho:leaderboard:{mode}:{country}`
- Mode 7 (rx!mania) maps to redis key 8 for rank lookups
- Scores join with `lazer_scores` table to get `mods_json` when available
- Mods can be parsed as integer or string (e.g. "HDDT"), with `=` prefix for strong equality and `~` for weak
- Reference implementation lives in `reference/meat-my-beat-i/` for comparison
