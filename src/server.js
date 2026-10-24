import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config/env.js';
import routes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { initScheduler } from './jobs/scheduler.js';
import { initAllSessions } from './whatsapp/sessionManager.js';
import { ensureStudentShareTokens } from './models/Student.js';

const app = express();

// Security and utility middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman) or matching clientUrl / localhost
      if (!origin || origin === config.clientUrl || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in dev, lock to Netlify origin in prod
    },
    credentials: true
  })
);

app.use(express.json());
if (config.nodeEnv !== 'test') {
  app.use(apiLimiter);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Lazy DB connection middleware (supports serverless environments like Vercel Functions)
app.use(async (req, res, next) => {
  if (req.path === '/health' || req.path === '/favicon.ico') {
    return next();
  }
  try {
    await ensureDbConnected();
    next();
  } catch (err) {
    console.error('[DB] Request failed due to database connection error:', err.message);
    res.status(503).json({
      success: false,
      error: `Database unavailable: ${err.message}`
    });
  }
});

// Mount API routes under both /api and root to support all path conventions
app.use('/api', routes);
app.use('/', routes);

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ServerError]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

let dbConnectionPromise = null;

/**
 * Ensures MongoDB is connected, reusing existing connections across invocations
 */
export async function ensureDbConnected() {
  if (mongoose.connection.readyState === 1) return;
  if (!dbConnectionPromise) {
    dbConnectionPromise = connectDatabase()
      .then(async () => {
        await ensureStudentShareTokens().catch((err) => {
          console.warn('[DB] Warning in ensureStudentShareTokens:', err.message);
        });
      })
      .finally(() => {
        dbConnectionPromise = null;
      });
  }
  return dbConnectionPromise;
}

/**
 * Connect to MongoDB with automated in-memory fallback for smooth local testing
 */
export async function connectDatabase() {
  try {
    console.log(`[DB] Attempting connection to MongoDB at ${config.mongodbUri}...`);
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('[DB] Connected to MongoDB successfully.');
  } catch (err) {
    console.warn(`[DB] Could not connect to primary MongoDB (${err.message}).`);

    if (config.nodeEnv !== 'production') {
      console.log('[DB] Starting MongoDB Memory Server for local development...');
      try {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        const mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        await mongoose.connect(uri);
        console.log(`[DB] Connected to MongoMemoryServer at ${uri}`);
        return mongod;
      } catch (memErr) {
        console.error('[DB] Failed to start MongoMemoryServer:', memErr.message);
        process.exit(1);
      }
    } else {
      console.error('[DB] Fatal: MongoDB connection required in production mode.');
      throw new Error(`MongoDB connection failed (${err.message}). Check MONGODB_URI in environment variables.`);
    }
  }
}

// Start Server
export async function bootstrap() {
  await ensureDbConnected();

  // Reconnect Baileys sessions for tutors who were previously connected
  await initAllSessions();

  // Initialize minute-by-minute scheduler
  initScheduler();

  const server = app.listen(config.port, () => {
    console.log(`=========================================`);
    console.log(`🚀 TutorBot Server running on port ${config.port}`);
    console.log(`📡 Health check: http://localhost:${config.port}/health`);
    console.log(`⏰ Scheduler: Active (Asia/Dhaka timezone)`);
    console.log(`=========================================`);
  });

  // Graceful shutdown
  const gracefulShutdown = async () => {
    console.log('\n[Server] Gracefully shutting down...');
    server.close(async () => {
      await mongoose.disconnect();
      console.log('[Server] MongoDB disconnected. Process exiting.');
      process.exit(0);
    });
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

  return server;
}

// Auto-bootstrap only if executed directly (not when required/imported for testing)
const isMain = process.argv[1] && process.argv[1].endsWith('server.js');
if (isMain && process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
  });
}

export default app;
