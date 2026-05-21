import Redis from "ioredis";

let client: Redis;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis({
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
      db: parseInt(process.env.REDIS_DB ?? "0", 10),
      password: process.env.REDIS_PASS || undefined,
      username: process.env.REDIS_USER || undefined,
      lazyConnect: true,
    });
  }
  return client;
}
