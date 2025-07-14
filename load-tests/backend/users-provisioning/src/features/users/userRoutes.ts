import { Hono } from "hono";
import { createFactory } from "hono/factory";
import { SuiUserService } from "./userService.js";
import { UserRepository } from "./userRepository.js";
import type { UserVariant } from "../../core/types.js";
import db from "../../db.js";

// Define types for our dependencies
type UserVariables = {
  userService: SuiUserService;
  userRepository: UserRepository;
};

// Initialize services
const userService = new SuiUserService();
const userRepository = new UserRepository(db);

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
  c.set("userRepository", userRepository);
  await next();
});

// Define routes using method chaining for better type inference
users
  .use("/generate/*", withErrorHandling)
  .post("/generate/:variant", async (c) => {
    const userVariant = c.req.param("variant");
    if (userVariant !== "active" && userVariant !== "passive") {
      return c.json(
        {
          error: "Invalid user variant. Available values: 'active', 'passive' ",
        },
        400
      );
    }

    const generatedUser = c.var.userService.generateUser(
      userVariant as UserVariant
    );
    c.var.userRepository.createUser({
      ...generatedUser,
      is_funded: false,
    });

    return c.json({
      message: `${
        userVariant.charAt(0).toUpperCase() + userVariant.slice(1)
      } user generated.`,
      user: {
        sui_address: generatedUser.sui_address,
        user_type: generatedUser.user_type,
      },
    });
  });

export default users;
