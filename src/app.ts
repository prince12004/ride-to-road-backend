import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";

import { env } from "./config/env";
import apiRoutes from "./routes";
import { notFound, errorHandler } from "./middleware/errorHandler";
import { generalApiLimiter } from "./middleware/rateLimit";

const app = express();

// Behind Nginx / Render the client IP arrives in X-Forwarded-For. Without
// this every request looks like it comes from the proxy, so the rate
// limiters would throttle all users together as one IP.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));
app.use(helmet());
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(morgan(env.isProd ? "combined" : "dev"));

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "Ride to Road API is running." });
});

app.use("/api", generalApiLimiter, apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
