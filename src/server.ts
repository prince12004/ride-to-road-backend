import app from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { bootstrapSuperAdmin } from "./utils/bootstrapAdmin";
import { bootstrapDefaults } from "./utils/bootstrapDefaults";

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});

async function bootstrap() {
  for (let attempt = 1; ; attempt++) {
    try {
      await bootstrapSuperAdmin();
      await bootstrapDefaults();
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[server] Bootstrap attempt ${attempt} failed: ${message}. Retrying in 5s…`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function start() {
  // Listen first so the frontend gets real responses (not ECONNREFUSED)
  // even while the database connection is still being established.
  app.listen(env.port, () => {
    console.log(`[server] Ride to Road API listening on port ${env.port} (${env.nodeEnv})`);
  });

  await connectDB();
  await bootstrap();
  console.log("[server] Ready");
}

start().catch((err) => {
  console.error("[server] Failed to start", err);
  process.exit(1);
});
