import { Hono } from "hono";
import { createFactory } from "hono/factory";
import { SuiContractService } from "./suiContractService.js";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiClient } from "@mysten/sui/client";
import { config } from "../../appConfig.js";

// Define types for our dependencies
type ContractVariables = {
  suiContractService: SuiContractService;
  contractDuration: number;
  contractGasCost: number;
};

// Initialize services
const suiClient = new SuiClient({ url: config.suiFullNode });
const suiContractService = new SuiContractService(suiClient);

// Create a new router instance with typed variables
const contract = new Hono<{
  Variables: ContractVariables;
}>();

// Use the factory pattern for route handlers
const factory = createFactory<{
  Variables: ContractVariables;
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
contract.use("*", async (c, next) => {
  c.set("suiContractService", suiContractService);
  await next();
});

contract.use("/*", withErrorHandling);

contract.post("/channel", async (c) => {
  const { secret_key, channel_name, initial_members } = await c.req.json();

  if (!secret_key || !channel_name) {
    return c.json(
      {
        error: "Missing required fields: secret_key, channel_name",
      },
      400
    );
  }

  // const { secretKey } = decodeSuiPrivateKey(secret_key);
  const keypair = Ed25519Keypair.fromSecretKey(secret_key);

  const result = await c.var.suiContractService.createChannelWithDefaults(
    keypair,
    channel_name,
    initial_members
  );
  c.set("contractDuration", c.var.suiContractService.lastDuration);
  c.set("contractGasCost", c.var.suiContractService.lastGasCost);

  return c.json({
    message: `Channel created successfully.`,
    channel: result,
  });
});

contract.post("/channel/message", async (c) => {
  const { secret_key, channel_id, member_cap_id, message } = await c.req.json();

  if (!secret_key || !channel_id || !member_cap_id || !message) {
    return c.json(
      {
        error:
          "Missing required fields: secret_key, channel_id, member_cap_id, message",
      },
      400
    );
  }

  // const { secretKey } = decodeSuiPrivateKey(secret_key);
  const keypair = Ed25519Keypair.fromSecretKey(secret_key);

  await c.var.suiContractService.sendMessage(
    keypair,
    channel_id,
    member_cap_id,
    message
  );
  c.set("contractDuration", c.var.suiContractService.lastDuration);
  c.set("contractGasCost", c.var.suiContractService.lastGasCost);

  return c.json({
    message: `Message sent successfully to channel ${channel_id}.`,
  });
});

contract.get("/channel/memberships/:user_address", async (c) => {
  const userAddress = c.req.param("user_address");
  const limit = parseInt(c.req.query("limit") || "10", 10);

  if (!userAddress) {
    return c.json(
      {
        error: "Missing required field: user_address",
      },
      400
    );
  }

  const result = await c.var.suiContractService.fetchLatestChannelMemberships(
    userAddress,
    limit
  );
  c.set("contractDuration", c.var.suiContractService.lastDuration);

  return c.json({
    message: `Found ${result.length} memberships for user ${userAddress}.`,
    memberships: result,
  });
});

contract.get("/channel/:channel_id/messages", async (c) => {
  const channelId = c.req.param("channel_id");
  const limit = parseInt(c.req.query("limit") || "10", 10);

  if (!channelId) {
    return c.json(
      {
        error: "Missing required field: channel_id",
      },
      400
    );
  }

  const result = await c.var.suiContractService.fetchLatestMessagesByChannelId(
    channelId,
    limit
  );
  c.set("contractDuration", c.var.suiContractService.lastDuration);

  return c.json({
    message: `Found ${result.length} messages for channel ${channelId}.`,
    messages: result,
  });
});

contract.get("/channel/:channel_id", async (c) => {
  const channelId = c.req.param("channel_id");

  if (!channelId) {
    return c.json(
      {
        error: "Missing required field: channel_id",
      },
      400
    );
  }

  const result = await c.var.suiContractService.fetchChannelById(channelId);
  c.set("contractDuration", c.var.suiContractService.lastDuration);

  return c.json({
    message: `Channel ${channelId} fetched successfully.`,
    channel: result,
  });
});

contract.get("/messages/table/:table_id", async (c) => {
  const tableId = c.req.param("table_id");
  const limit = parseInt(c.req.query("limit") || "10", 10);

  if (!tableId) {
    return c.json(
      {
        error: "Missing required field: table_id",
      },
      400
    );
  }

  const result = await c.var.suiContractService.fetchLatestMessagesByTableId(
    tableId,
    limit
  );
  c.set("contractDuration", c.var.suiContractService.lastDuration);

  return c.json({
    message: `Found ${result.length} messages from table ${tableId}.`,
    messages: result,
  });
});

contract.get("/channel/memberships/:user_address/with-metadata", async (c) => {
  const userAddress = c.req.param("user_address");
  const limit = parseInt(c.req.query("limit") || "10", 10);

  if (!userAddress) {
    return c.json(
      {
        error: "Missing required field: user_address",
      },
      400
    );
  }

  const result =
    await c.var.suiContractService.fetchLatestChannelMembershipsWithMetadata(
      userAddress,
      limit
    );
  c.set("contractDuration", c.var.suiContractService.lastDuration);

  return c.json({
    message: `Found ${result.length} memberships with metadata for user ${userAddress}.`,
    memberships: result,
  });
});

export default contract;
