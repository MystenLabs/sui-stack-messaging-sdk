// Helper to get environment variables with default values
function getEnv(name, defaultValue) {
  if (__ENV[name] !== undefined) {
    return __ENV[name];
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`${name} not found in ENV. No defaultValue provided.`);
}

export const config = {
  // SUI Configuration
  // rpcUrl: getEnv('SUI_RPC_URL', 'https://fullnode.testnet.sui.io:443'),
  // rpcUrl: getEnv("SUI_RPC_URL", "http://127.0.0.1:9000"),
  gasBudget: getEnv("GAS_BUDGET", "100000000"), // 0.1 SUI
  // packageId: getEnv("PACKAGE_ID"), // throw if not in ENV

  // User Provisioning Configuration
  provisioningApiUrl: getEnv("PROVISIONING_API_URL", "http://localhost:4321"),
  fundingAccount: {
    address: getEnv("ADMIN_SUI_ADDRESS"), // Pre-funded address for distributing funds, throw if not in ENV
    secretKey: getEnv("ADMIN_SECRET_KEY"), // throw if not in ENV
    amountPerUser: getEnv("ADMIN_AMOUNT_PER_USER", "2000000000"), // 2 SUI
  },

  // Test Load Configuration
  activeUsers: {
    total: parseInt(getEnv("ACTIVE_USERS_TOTAL", "16")),
    perChannel: parseInt(getEnv("ACTIVE_USERS_PER_CHANNEL", "2")),
    thinkTimeSecMin: parseInt(getEnv("ACTIVE_USERS_THINK_TIME_SEC_MIN", "4")),
    thinkTimeSecMax: parseInt(getEnv("ACTIVE_USERS_THINK_TIME_SEC_MAX", "10")),
    messagesPerSession: parseInt(
      getEnv("ACTIVE_USERS_MESSAGES_PER_SESSION", "5")
    ),
  },
  passiveUsers: {
    total: parseInt(getEnv("PASSIVE_USERS_TOTAL", "64")),
    perChannel: parseInt(getEnv("PASSIVE_USERS_PER_CHANNEL", "8")),
    pollingInterval: parseInt(getEnv("PASSIVE_USERS_POLLING_INTERVAL", "6")),
  },

  // Test Duration & VUs
  duration: getEnv("DURATION", "1m"),
  testThresholds: {
    // 95% of requests must finish within 4 seconds.
    http_req_duration: ["p(95)<4000"],
    // No more than 1% of requests should fail.
    http_req_failed: ["rate<0.01"],
  },

  // HTTP Client Configuration for better connection handling
  httpClient: {
    timeout: "45s", // Match server timeout
  },
};
