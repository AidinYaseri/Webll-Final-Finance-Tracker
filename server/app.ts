import express from "express";
import net from "net";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { getPool } from "./src/db.js";
import { initializeDatabase } from "./src/schema.js";
import { errorHandler } from "./src/middleware.js";

// Import routes
import authRoutes from "./src/routes/auth.js";
import transactionRoutes from "./src/routes/transactions.js";
import categoryRoutes from "./src/routes/categories.js";
import dashboardRoutes from "./src/routes/dashboard.js";
import adminRoutes from "./src/routes/admin.js";

dotenv.config();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const PgSession = connectPgSimple(session);

const startServer = async () => {
  try {
    const pool = await getPool();

    const app = express();

    // Middleware
    app.use(
      cors({
        origin: CLIENT_URL,
        credentials: true,
      }),
    );
    app.use(express.json());
    app.use(
      session({
        store: new PgSession({
          pool,
          createTableIfMissing: true,
        }),
        secret:
          process.env.SESSION_SECRET ||
          process.env.JWT_SECRET ||
          "dev-session-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          sameSite: "lax",
          secure: false,
          maxAge: 1000 * 60 * 60 * 24 * 7,
        },
      }),
    );

    await initializeDatabase();
    console.log("✓ Database initialized");
    // Routes
    app.use("/api/auth", authRoutes);
    app.use("/api/transactions", transactionRoutes);
    app.use("/api/categories", categoryRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/dashboard", dashboardRoutes);

    // Health check
    app.get("/health", (req, res) => {
      res.json({ status: "OK" });
    });

    // Error handling middleware
    app.use(errorHandler);

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ error: "Route not found" });
    });

    // Wait until port is free (helpful when nodemon restarts quickly)
    const isPortFree = (port: number) =>
      new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(500);
        socket.once("connect", () => {
          socket.destroy();
          resolve(false);
        });
        socket.once("timeout", () => {
          socket.destroy();
          resolve(true);
        });
        socket.once("error", () => {
          resolve(true);
        });
        socket.connect(port, "127.0.0.1");
      });

    const waitForPortFree = async (
      port: number,
      retries = 10,
      delayMs = 200,
    ) => {
      for (let i = 0; i < retries; i++) {
        // true => free
        const free = await isPortFree(port);
        if (free) return true;
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return false;
    };

    const portFree = await waitForPortFree(Number(PORT), 15, 200);
    if (!portFree) {
      console.error(
        `Port ${PORT} appears in use after retries — aborting bind.`,
      );
      process.exit(1);
    }

    // Start server and handle errors
    const server = app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
    });

    server.on("error", (err: any) => {
      console.error("Server error:", err);
      process.exit(1);
    });

    // Graceful shutdown: nodemon sends SIGTERM by default with our flag
    const shutdown = () => {
      console.log("Shutting down server...");
      server.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
      // Force exit after timeout
      setTimeout(() => process.exit(1), 5000);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (error) {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  }
};

void startServer();
