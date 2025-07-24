import cluster from "cluster";
import os from "os";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./appConfig.js";
import userRoutes from "./features/users/userRoutes.js";
import contractRoutes from "./features/contract/contractRoutes.js";

type Variables = {
  contractDuration: number;
  contractGasCost: number;
};

const app = new Hono<{ Variables: Variables }>();

// Timing middleware to measure backend processing time
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  c.header("X-Internal-Duration", duration.toString());

  const contractDuration = c.get("contractDuration");
  if (contractDuration) {
    c.header("X-Contract-Duration", contractDuration.toString());
  }

  const contractGasCost = c.get("contractGasCost");
  if (contractGasCost) {
    c.header("X-Gas-Cost", contractGasCost.toString());
  }
});

// Health check endpoint
app.get("/", (c) => {
  return c.json({
    status: "healthy",
    service: "User Provisioning Service",
    version: "1.0.0",
  });
});

// Mount feature routes
app.route("/users", userRoutes);
app.route("/contract", contractRoutes);

// Server configuration for high load
const serverConfig = {
  fetch: app.fetch,
  port: config.port,
  // Connection handling
  maxConnections: 5000, // Increase from default
  // Timeout settings
  requestTimeout: 45000, // 45 seconds for blockchain operations
  // Keep-alive settings
  keepAliveTimeout: 75000, // Slightly higher than client timeout
  headersTimeout: 76000, // Slightly higher than keep-alive
  // Additional Node.js server options
  maxHeaderSize: 16384, // 16KB headers
  connectionsCheckingInterval: 30000, // Check connections every 30s
};

// Cluster setup for better CPU utilization
if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  const numWorkers = Math.min(numCPUs, 4); // Don't spawn too many workers

  console.log(`🚀 Starting ${numWorkers} workers on ${numCPUs} CPUs`);

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`💥 Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  // Worker process - start the server
  serve(serverConfig, (info) => {
    console.log(
      `✅ Worker ${process.pid} running on http://localhost:${info.port}`
    );
    console.log(`   - Max connections: ${serverConfig.maxConnections}`);
    console.log(`   - Request timeout: ${serverConfig.requestTimeout}ms`);
    console.log(`   - Keep-alive timeout: ${serverConfig.keepAliveTimeout}ms`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("🛑 Worker received SIGTERM, shutting down gracefully");
    process.exit(0);
  });
}
