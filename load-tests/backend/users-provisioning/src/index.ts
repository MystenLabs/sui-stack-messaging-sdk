import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./appConfig.js";
import userRoutes from "./features/users/userRoutes.js";
import contractRoutes from "./features/contract/contractRoutes.js";

const app = new Hono();

// Timing middleware to measure backend processing time
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  c.header("X-Internal-Duration", duration.toString());
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

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(
      `✅ User Provisioning Service is running on http://localhost:${info.port}`
    );
  }
);
