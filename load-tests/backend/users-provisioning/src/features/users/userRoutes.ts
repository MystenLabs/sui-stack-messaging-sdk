import { Hono } from "hono";
import { createFactory } from "hono/factory";
import { SuiUserService } from "./userService.js";
import { UserRepository } from "./userRepository.js";
import type { UserVariant } from "../../core/types.js";
import db from "../../db.js";

// Define types for our dependencies
type UserVariables = {
  userService: SuiUserService;
};

// Initialize services
const userRepository = new UserRepository(db);
const userService = new SuiUserService(userRepository);

// Create a new router instance with typed variables
const users = new Hono<{
  Variables: UserVariables;
}>();

// Use the factory pattern for route handlers
const factory = createFactory<{
  Variables: UserVariables;
}>();

// Create error handling middleware
const withErrorHandling = factory.createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Handle user generation with proper type checking
users.use("*", async (c, next) => {
  c.set("userService", userService);
  await next();
});

// OpenAPI documentation for routes
const openApiDoc = {
  "/users": {
    get: {
      summary: "List users",
      parameters: [
        {
          name: "variant",
          in: "query",
          description: "Filter by user variant (active/passive)",
          schema: { type: "string", enum: ["active", "passive"] },
        },
        {
          name: "is_funded",
          in: "query",
          description: "Filter by funding status",
          schema: { type: "boolean" },
        },
        {
          name: "limit",
          in: "query",
          description:
            "Maximum number of users to return (default: 50, max: 100)",
          schema: { type: "integer", minimum: 1, maximum: 100 },
        },
        {
          name: "offset",
          in: "query",
          description: "Number of users to skip (for pagination)",
          schema: { type: "integer", minimum: 0 },
        },
      ],
      responses: {
        200: {
          description: "List of users",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sui_address: { type: "string" },
                        user_variant: {
                          type: "string",
                          enum: ["active", "passive"],
                        },
                        is_funded: { type: "boolean" },
                      },
                    },
                  },
                  total: { type: "integer" },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
  },
};

// Define routes using method chaining for better type inference
users
  .use("/*", withErrorHandling)
  // GET /users - List users with filtering and pagination
  .get("/", async (c) => {
    const variant = c.req.query("variant") as "active" | "passive" | undefined;
    const isFundedStr = c.req.query("is_funded");
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    // Validate variant if provided
    if (variant && variant !== "active" && variant !== "passive") {
      return c.json(
        { error: "Invalid variant. Must be 'active' or 'passive'" },
        400
      );
    }

    // Parse is_funded if provided
    const isFunded = isFundedStr ? isFundedStr === "true" : undefined;

    const result = c.var.userService.getUsers({
      variant,
      isFunded,
      limit,
      offset,
    });

    return c.json(result);
  })
  // GET /users/with-secrets - List users with secrets (FOR LOAD TESTING ONLY)
  .get("/with-secrets", async (c) => {
    // WARNING: This endpoint exposes secret keys and should only be used for load testing.
    // Do not use in a production environment.
    const variant = c.req.query("variant") as "active" | "passive" | undefined;
    const isFundedStr = c.req.query("is_funded");
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    if (variant && variant !== "active" && variant !== "passive") {
      return c.json(
        { error: "Invalid variant. Must be 'active' or 'passive'" },
        400
      );
    }

    const isFunded = isFundedStr ? isFundedStr === "true" : undefined;

    const result = c.var.userService.getUsersWithSecrets({
      variant,
      isFunded,
      limit,
      offset,
    });

    return c.json(result);
  })
  // POST /users/generate/:variant - Generate new users
  .post("/generate/:variant", async (c) => {
    const userVariant = c.req.param("variant");
    if (userVariant !== "active" && userVariant !== "passive") {
      return c.json(
        {
          error: "Invalid user variant. Available values: 'active', 'passive'",
        },
        400
      );
    }

    const count = parseInt(c.req.query("count") || "1", 10);

    // Validate count is a number
    if (isNaN(count)) {
      return c.json(
        {
          error: "Invalid count. Must be a valid number.",
        },
        400
      );
    }

    try {
      const result = c.var.userService.createUsers(
        userVariant as UserVariant,
        count
      );
      return c.json(result);
    } catch (error: any) {
      return c.json({ error: error.message }, 400);
    }
  })
  // POST /users/fund - Fund unfunded active users
  .post("/fund", async (c) => {
    const { sui_address, secret_key, amount_per_user } = await c.req.json();

    if (!sui_address || !secret_key || !amount_per_user) {
      return c.json(
        {
          error:
            "Missing required fields: sui_address, secret_key, amount_per_user",
        },
        400
      );
    }

    // Validate amount
    const amountPerUser = BigInt(amount_per_user);
    if (amountPerUser <= 0) {
      return c.json(
        {
          error: "amount_per_user must be greater than 0",
        },
        400
      );
    }

    const fundingAccount = {
      sui_address,
      secret_key,
    };

    try {
      const result = await c.var.userService.fundUnfundedActiveUsers(
        fundingAccount,
        amountPerUser
      );

      return c.json(result);
    } catch (error: any) {
      return c.json(
        {
          error: error.message,
        },
        500
      );
    }
  });

export default users;
