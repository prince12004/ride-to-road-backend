import mongoose from "mongoose";
import { env } from "./env";

mongoose.set("strictQuery", true);

const RETRY_DELAY_MS = 5000;

let listenersAttached = false;

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on("connected", () => console.log("[mongo] connected"));
  mongoose.connection.on("disconnected", () => console.warn("[mongo] disconnected — driver will reconnect"));
  mongoose.connection.on("reconnected", () => console.log("[mongo] reconnected"));
  // Transient network errors (timeouts, pool cleared) are logged, not fatal:
  // the driver keeps retrying in the background.
  mongoose.connection.on("error", (err) => console.error("[mongo] connection error:", err.message));
}

/**
 * Connects to MongoDB, retrying until it succeeds. Atlas connections from a
 * home/office network can time out intermittently; a single failure should
 * not take the whole API down.
 */
export async function connectDB(): Promise<void> {
  attachListeners();
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(env.mongoUri, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        family: 4, // prefer IPv4; avoids slow/failed IPv6 routes to Atlas
      });
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mongo] connect attempt ${attempt} failed: ${message}. Retrying in ${RETRY_DELAY_MS / 1000}s…`);
      await mongoose.disconnect().catch(() => undefined);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}
