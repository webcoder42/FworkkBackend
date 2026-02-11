import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import http from "http";
import helmet from "helmet";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import { xss } from "express-xss-sanitizer";
import compression from "compression";
import mongoose from "mongoose";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

// Config & Utils
import connectDB from "./config/db.js";
import { redisClient } from "./config/redis.js";
import { uniqueAllowedOrigins, setupDirectories } from "./config/constants.js";
import logger from "./utils/logger.js";
import { validateEnv } from "./utils/validateEnv.js";

// Middleware
import { apiLimiter } from "./middleware/rateLimiter.js";
import errorHandler from "./middleware/errorMiddleware.js";

// Routes & Sockets
import setupRoutes from "./Route/index.js";
import { setupSocket } from "./socket/socketHandler.js";

// Cron / Schedulers
import './utils/payoutCron.js'; 
import runScheduler from './utils/AutoBlogScheduler.js';
import { initializeCronJobs } from './services/CronScheduler.js';

// Initialization
dotenv.config();
validateEnv();
const { uploadsDir, generatedRootDir } = setupDirectories();

// Sentry Initialization
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      nodeProfilingIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
  });
}

const app = express();
if (process.env.SENTRY_DSN) {
  // The request handler must be the first middleware on the app
  Sentry.setupExpressErrorHandler(app); 
}
app.set("trust proxy", 1); 
const server = http.createServer(app);

// Initialize Socket.io
const io = setupSocket(server, uniqueAllowedOrigins);

// Middleware to attach io to request object
app.use((req, res, next) => {
  req.io = io;
  next();
});

// CORE MIDDLEWARE
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || uniqueAllowedOrigins.includes(origin) || uniqueAllowedOrigins.includes(origin + '/')) {
      callback(null, true);
    } else {
      logger.error(`❌ Express CORS blocked for origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: false, // Changed to false to avoid third-party cookie issues on mobile
}));

app.use(apiLimiter);
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));
// app.use(cookieParser()); // Disabled to avoid third-party cookie issues on mobile
app.use(helmet());
app.use(hpp());
app.use(xss());
app.use(compression());
app.use(morgan("dev"));

// STATIC FILES
const staticOptions = { maxAge: '1d', etag: true };
app.use("/uploads", express.static(uploadsDir, staticOptions));
app.use("/live", express.static(generatedRootDir, staticOptions));

// ROUTES
setupRoutes(app);

// Health check
app.get("/health", async (req, res) => {
  const dbState = mongoose.connection.readyState;
  let dbStatus = ["disconnected", "connected", "connecting", "disconnecting"][dbState] || "unknown";
  res.json({
    server: "ok",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => res.send("Welcome to Fworkk "));

// Error Handling
if (process.env.SENTRY_DSN) {
  // The error handler must be before any other error middleware and after all controllers/routes
  // Note: setupExpressErrorHandler already handles some of this in newer versions, 
  // but we can add manual capture in the errorHandler middleware.
}
app.use(errorHandler);

// STARTUP
const PORT = process.env.PORT || 8080;

const startServer = async () => {
  try {
    await connectDB();
    
    // Initialize Schedulers (Only on the first instance in cluster mode)
    if (process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === '0') {
      runScheduler(); 
      initializeCronJobs();
      logger.info("🕒 Schedulers initialized on primary instance.");
    } else {
      logger.info(`⏩ Schedulers skipped for instance ${process.env.NODE_APP_INSTANCE || 'n/a'}`);
    }

    server.listen(PORT, () =>
      logger.info(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on Port ${PORT}`)
    );
  } catch (error) {
    logger.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();

export { redisClient, io };
