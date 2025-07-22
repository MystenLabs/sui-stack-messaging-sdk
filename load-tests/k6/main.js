import { setupTestEnvironment } from './provisioning.js';
import { activeUserWorkflow, passiveUserWorkflow } from './scenarios.js';
import { config } from './config.js';

// --- k6 Options ---
export const options = {
    scenarios: {
        active_users: {
            executor: 'ramping-vus',
            stages: [
                { duration: '5s', target: config.activeUsers.total },
                { duration: config.duration, target: config.activeUsers.total },
                { duration: '5s', target: 0 }
            ],
            exec: 'active_user_scenario', // Tag for routing
        },
        passive_users: {
            executor: 'constant-vus',
            vus: config.passiveUsers.total,
            duration: config.duration,
            startTime: '20s',
            exec: 'passive_user_scenario', // Tag for routing
        },
    },
    thresholds: {
        ...config.testThresholds,
        // Add specific thresholds for custom metrics
        'createChannel_latency': ['p(95)<4000'],
        'sendMessage_latency': ['p(95)<3500'],
        'fetchChannelMessages_latency': ['p(95)<2500'],
    },
    setupTimeout: '10m'
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
    // This function won't be called since we're using named scenario functions
    console.log("Default function called - this shouldn't happen with named scenario exports");
}

export function teardown(data) {
    console.log("Load test finished.");
}