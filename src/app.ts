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
