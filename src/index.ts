import "dotenv/config";
import Fastify from "fastify";
import { v1Router } from "./routes/v1";

const app = Fastify({ logger: true });

app.register(v1Router, { prefix: "/v1" });

const host = process.env.APP_HOST ?? "0.0.0.0";
const port = parseInt(process.env.APP_PORT ?? "7273", 10);

app.listen({ host, port }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
