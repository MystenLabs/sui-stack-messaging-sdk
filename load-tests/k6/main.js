import { setupTestEnvironment } from "./provisioning.js";
import { activeUserWorkflow, passiveUserWorkflow } from "./scenarios.js";
import { config } from "./config.js";

// --- k6 Options ---
export const options = {
  scenarios: {
    active_users: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: config.activeUsers.total }, // ramp up to total
        { duration: config.duration, target: config.activeUsers.total }, // stay at total
      ],
      startTime: "10s",
      exec: "active_user_scenario", // Tag for routing
    },
    passive_users: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: config.passiveUsers.total }, // ramp up to total
        { duration: config.duration, target: config.passiveUsers.total }, // stay at total
      ],
      startTime: "20s",
      exec: "passive_user_scenario", // Tag for routing
    },
  },
  thresholds: {
    ...config.testThresholds,
    // Add specific thresholds for custom metrics
    createChannel_latency: ["p(95)<5000"],
    sendMessage_latency: ["p(95)<4000"],
    fetchChannelMessagesByTableId_latency: ["p(95)<1000"],
  },
  setupTimeout: "10m",
};

// --- k6 Lifecycle Functions ---

export function setup() {
  return setupTestEnvironment();
}

// Export the scenario functions with the names k6 expects
export function active_user_scenario(data) {
  activeUserWorkflow(data);
}

export function passive_user_scenario(data) {
  passiveUserWorkflow(data);
}

// Default function is no longer needed since we're using named exports
export default function (data) {
  // This function won't be called since we're using named scenario exports
  console.log(
    "Default function called - this shouldn't happen with named scenario exports"
  );
}

export function teardown(data) {
  console.log("Load test finished.");
}
