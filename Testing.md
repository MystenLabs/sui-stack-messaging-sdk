## Table of Contents

- [Home - Overview and Installation](./README.md)
- [Developer Setup](./Setup.md)
- [SDK API Reference](./APIRef.md)

# Integration Testing

The SDK includes comprehensive integration tests that validate the complete messaging flow.

## Test Environment Options

The integration tests support two environments:

- **Localnet**: Uses Docker containers to spin up a local Sui node with indexer and PostgreSQL. Ideal for development and CI/CD pipelines. CAVEAT: seal/walrus are mocked in this case.
- **Testnet**: Uses the public Sui testnet. Requires funded accounts and deployed contracts. Better for testing against real network conditions.

## Running Integration Tests

### Localnet Tests (Recommended for Development)

Localnet tests are self-contained and don't require external setup:

```bash
# Run all integration tests on localnet
pnpm run test:integration:localnet

# Run specific test files
TEST_ENVIRONMENT=localnet pnpm test integration-write.test.ts
```

### Testnet Tests

Testnet tests require pre-deployed contracts and funded accounts:

```bash
# 1. First, set up the testnet environment (see Testnet Setup Process below)
pnpm run setup-testnet

# 2. Then run the integration tests
pnpm run test:integration:testnet
```

## Test Data Setup

The integration tests use a sophisticated data preparation system:

### Integration Write Tests (`integration-write.test.ts`)

- **Simple setup**: Creates fresh channels and messages during test execution
- **No pre-requisites**: Can be run immediately without additional setup
- **Tests**: Channel creation, message sending, and basic functionality

### Integration Read Tests (`integration-read-v2.test.ts`)

- **Requires test data**: Uses pre-generated test data to avoid spending SUI on each test run
- **Setup required**: Run `pnpm run prepare-test-data` first to create test channels and messages
- **Tests**: Pagination, message decryption, attachment handling, and complex query scenarios

## Testnet Setup Process

For testnet testing, you need to set up funded test accounts and prepare test data. The process involves two main steps:

### 1. Environment Configuration

Use the provided `example-testnet-setup.sh` script as a template:

```bash
# Copy and customize the example setup script
cp test/example-testnet-setup.sh my-testnet-setup.sh
# Edit the script with your actual values
```

The script requires these environment variables:

**Required for Testnet Setup:**

- `TESTNET_FUNDER_ADDRESS`: Address of your funded testnet account (used to fund test users)
- `TESTNET_FUNDER_SECRET_KEY`: Secret key of the funder account
- `TESTNET_PACKAGE_ID`: Your deployed messaging package ID on testnet
- `TESTNET_SEAL_APPROVE_PACKAGE_ID`: Your deployed seal approve contract package ID
- `TESTNET_SECRET_KEY`: Secret key of your main test account

**Optional:**

- `TEST_ENVIRONMENT`: Set to "testnet" (defaults to "localnet")
- `SUI_RPC_URL`: Custom RPC URL (defaults to testnet fullnode)

### 2. Automated Setup

Run the complete testnet setup process:

```bash
# Option 1: Use the example script (after customizing it)
./my-testnet-setup.sh

# Option 2: Set environment variables manually and run setup
export TESTNET_FUNDER_ADDRESS="0x..."
export TESTNET_FUNDER_SECRET_KEY="..."
export TESTNET_PACKAGE_ID="0x..."
export TESTNET_SEAL_APPROVE_PACKAGE_ID="0x..."
export TESTNET_SECRET_KEY="..."
pnpm run setup-testnet
```

The setup process will:

1. **Fund test users**: Create 5 test accounts and fund them with 0.1 SUI each from your funder account
2. **Prepare test data**: Create channels, send messages, and generate test data for the read tests

## Test Data Preparation

The `prepare-test-data.ts` script creates a comprehensive test dataset:

```bash
# Generate test data (creates channels, messages, and attachments)
npm run prepare-test-data
```

This script creates:

- **Empty channels** (1 member, 0 messages)
- **Small channels** (2 members, 3 messages)
- **Medium channels** (3 members, 10 messages for pagination testing)
- **Channels with attachments** (messages with file attachments)

The generated test data is saved to `test-data.json` and includes:

- Channel IDs and member information
- Encryption keys for each member
- Message counts and metadata
- Attachment references

## Environment Variables

For testnet tests, set these environment variables:

```bash
# Required for testnet testing
export TESTNET_PACKAGE_ID="0x..."
export TESTNET_SEAL_APPROVE_PACKAGE_ID="0x..."
export TESTNET_SECRET_KEY="your-main-test-account-secret-key"

# Required for funding test users (if using setup-testnet)
export TESTNET_FUNDER_ADDRESS="0x..."
export TESTNET_FUNDER_SECRET_KEY="your-funder-account-secret-key"

# Optional
export TEST_ENVIRONMENT="testnet"
export SUI_RPC_URL="https://fullnode.testnet.sui.io:443"
```

**Note**: The funder account should have sufficient SUI to fund 5 test accounts with 0.1 SUI each (0.5 SUI total).

## Test Scripts

Available test commands:

```bash
# Unit tests only
pnpm test

# Integration tests (all environments)
pnpm run test:integration

# Localnet integration tests
pnpm run test:integration:localnet

# Testnet integration tests
pnpm run test:integration:testnet

# Setup testnet environment
pnpm run setup-testnet

# Prepare test data
pnpm run prepare-test-data
```

[Back to table of contents](#table-of-contents)