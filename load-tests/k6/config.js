// Helper to get environment variables with default values
function getEnv(name, defaultValue) {
    if (__ENV[name] !== undefined) {return __ENV[name] }
    if (defaultValue !== undefined) {return defaultValue }
    throw new Error(`${name} not found in ENV. No defaultValue provided.`);
}

export const config = {
    // SUI Configuration
    rpcUrl: getEnv('SUI_RPC_URL', 'https://fullnode.testnet.sui.io:443'),
    gasBudget: getEnv('GAS_BUDGET', '100000000'), // 0.1 SUI
    packageId: getEnv('PACKAGE_ID'), // throw if not in ENV 
    
    // User Provisioning Configuration
    provisioningApiUrl: getEnv('PROVISIONING_API_URL', 'http://localhost:4321'),
    admin: {
        address: getEnv('ADMIN_SUI_ADDRESS'), // Pre-funded address for distributing funds, throw if not in ENV
        secretKey: getEnv('ADMIN_SECRET_KEY'), // throw if not in ENV
    },

    // Test Load Configuration
    channelCount: parseInt(getEnv('CHANNEL_COUNT', '100')),
    activeUsers: {
        total: parseInt(getEnv('ACTIVE_USERS_TOTAL', '200')),
        perChannel: parseInt(getEnv('ACTIVE_USERS_PER_CHANNEL', '2')),
        thinkTimeSecMin: parseInt(getEnv('ACTIVE_USERS_THINK_TIME_SEC_MIN', '2')),
        thinkTimeSecMax: parseInt(getEnv('ACTIVE_USERS_THINK_TIME_SEC_MAX', '10')),
        messagesPerSession: parseInt(getEnv('ACTIVE_USERS_MESSAGES_PER_SESSION', '10')),
    },
    passiveUsers: {
        total: parseInt(getEnv('PASSIVE_USERS_TOTAL', '2000')),
        perChannel: parseInt(getEnv('PASSIVE_USERS_PER_CHANNEL', '8')),
        pollingInterval: parseInt(getEnv('PASSIVE_USERS_POLLING_INTERVAL', '2')),
    },

    // Test Duration & VUs
    duration: getEnv('DURATION', '5m'),
    testThresholds: {
        // 95% of requests must finish within 2 seconds.
        'http_req_duration': ['p(95)<2000'], 
        // No more than 1% of requests should fail.
        'http_req_failed': ['rate<0.01'], 
    }
};