import { setupTestEnvironment } from './provisioning.js';
import { activeUserWorkflow, passiveUserWorkflow } from './scenarios.js';
import { config } from './config.js';
import { metrics } from './metrics.js';

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
            exec: 'passive_user_scenario', // Tag for routing
        },
    },
    thresholds: {
        ...config.testThresholds,
        // Add specific thresholds for custom metrics
        'sendMessage_latency': ['p(95)<3500'],
        'fetchChannelMessages_latency': ['p(95)<2500'],
    },
};

// --- k6 Lifecycle Functions ---

export function setup() {
    return setupTestEnvironment();
}

export default function (data) {
    // Route the VU to the correct scenario function based on the `exec` tag
    switch (__ENV.scenario) {
        case 'active_user_scenario':
            activeUserWorkflow(data);
            break;
        case 'passive_user_scenario':
            passiveUserWorkflow(data);
            break;
        default:
            // This happens for VUs that don't belong to a specific scenario
            break;
    }
}

export function teardown(data) {
    console.log("Load test finished.");
}