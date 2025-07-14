import { Hono } from "hono";
import { createFactory } from "hono/factory";
import { SuiUserService } from "./userService.js";
import { UserRepository } from "./userRepository.js";
import type { UserVariant } from "../../core/types.js";
import db from "../../db.js";

// Define types for our dependencies
type Bindings = {};
type Variables = {
  userService: SuiUserService;
  userRepository: UserRepository;
};

// Initialize services
const userService = new SuiUserService();
const userRepository = new UserRepository(db);

// Create a new router instance with typed variables
const users = new Hono<{
  Variables: Variables;
}>();

// Use the factory pattern for route handlers
const factory = createFactory<{
  Variables: Variables;
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
  .post("/generate/:type", async (c) => {
    const userType = c.req.param("type");
    if (userType !== "active" && userType !== "passive") {
      return c.json({ error: "Invalid user type" }, 400);
    }

    const generatedUser = c.var.userService.generateUser(
      userType as UserVariant
    );
    c.var.userRepository.createUser({
      ...generatedUser,
      is_funded: false,
    });

    return c.json({
      message: `${
        userType.charAt(0).toUpperCase() + userType.slice(1)
      } user generated.`,
      user: {
        sui_address: generatedUser.sui_address,
        user_type: generatedUser.user_type,
      },
    });
  });

export default users;
