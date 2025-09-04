# Test Environment Setup

This document explains how to run integration tests for the messaging SDK in different environments.

## Environment Variables

The test system supports two environments: `localnet` and `testnet`. The environment is controlled by the `TEST_ENVIRONMENT` environment variable.

### Localnet (Default)

For localnet tests, the system automatically:

- Sets up Docker containers (PostgreSQL + Sui local node)
- Deploys the messaging package and gets the package ID from the deployment
- Creates test accounts and funds them
- Cleans up containers after tests

**Required Environment Variables:**

- `TEST_ENVIRONMENT=localnet` (default, can be omitted)

**Optional Environment Variables:**

- `SUI_TOOLS_TAG` (optional, defaults to latest)
- `SUI_RPC_URL` (optional, defaults to `http://127.0.0.1:9000`)

**Note:** The package ID is automatically determined during the Docker setup and package deployment process.

### Testnet

For testnet tests, the system uses existing testnet infrastructure without Docker containers.

**Required Environment Variables:**

- `TEST_ENVIRONMENT=testnet`
- `TESTNET_PACKAGE_ID` - The deployed package ID on testnet
- `TESTNET_SEAL_APPROVE_PACKAGE_ID` - The seal approve contract package ID on testnet

**Optional Environment Variables:**

- `SUI_RPC_URL` (optional, defaults to `https://fullnode.testnet.sui.io:443`)

**Note:** No Docker containers are used for testnet tests. The system connects directly to the testnet infrastructure.

## Running Tests

### Localnet Tests (Default)

```bash
# Run integration tests on localnet (default)
pnpm test:integration

# Explicitly run on localnet
pnpm test:integration:localnet

# Run with custom Sui tools tag
SUI_TOOLS_TAG=your-tag pnpm test:integration:localnet
```

### Testnet Tests

```bash
# Set required environment variables
export TESTNET_PACKAGE_ID="0x..."
export TESTNET_SEAL_APPROVE_PACKAGE_ID="0x..."

# Run integration tests on testnet
pnpm test:integration:testnet

# Or set variables inline
TESTNET_PACKAGE_ID="0x..." TESTNET_SEAL_APPROVE_PACKAGE_ID="0x..." pnpm test:integration:testnet
```

## Test Configuration

The test configuration is managed by `test-config.ts`, which:

1. **Validates environment variables** - Ensures all required variables are set
2. **Provides network-specific configurations** - Different settings for localnet vs testnet
3. **Handles package ID resolution** - Automatically resolves package IDs based on environment

## Test Helpers

The `test-helpers.ts` file provides:

- `setupTestEnvironment()` - Main setup function that handles both environments
- `createTestClient()` - Creates properly configured messaging clients
- `validateTestEnvironment()` - Validates required environment variables
- Various helper functions for fetching and parsing on-chain data

## Architecture

### Localnet Setup

1. Starts Docker network
2. Launches PostgreSQL container
3. Launches Sui local node with indexer and GraphQL
4. Deploys the messaging package
5. Creates and funds test accounts
6. Returns configured clients and cleanup function

### Testnet Setup

1. Validates required environment variables
2. Creates Sui client connected to testnet
3. Generates test signer (you may want to use pre-funded accounts)
4. Returns configured clients

## Error Handling

The system provides clear error messages for:

- Missing required environment variables
- Invalid environment values
- Docker container startup failures
- Package deployment failures
- Network connectivity issues

## Best Practices

1. **Use environment variables** - Don't hardcode package IDs or network URLs
2. **Validate before running** - The system validates all required variables upfront
3. **Clean up resources** - Localnet tests automatically clean up Docker containers
4. **Use appropriate timeouts** - Localnet setup can take 2+ minutes, testnet is faster
5. **Handle network differences** - Some features (GraphQL, gRPC) are only available on localnet

## Troubleshooting

### Localnet Issues

- **Docker not running**: Ensure Docker is installed and running
- **Port conflicts**: Check if ports 9000, 9123-9125 are available
- **Container startup failures**: Check Docker logs and available resources
- **Package deployment failures**: Verify Move package is valid and compiles

### Testnet Issues

- **Missing package IDs**: Ensure `TESTNET_PACKAGE_ID` and `TESTNET_SEAL_APPROVE_PACKAGE_ID` are set
- **Network connectivity**: Verify you can reach `https://fullnode.testnet.sui.io:443`
- **Insufficient funds**: Testnet tests may need pre-funded accounts for gas fees
- **Package not deployed**: Ensure the messaging package is deployed on testnet

### General Issues

- **Environment variable not set**: Check the error message for missing variables
- **Invalid environment**: Use `localnet` or `testnet` only
- **Timeout errors**: Increase timeout values for slow networks or large setups
