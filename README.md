# sui-stack-messaging-sdk

DISCLAIMER: This package is under active development and should not be used in production yet.

A Sui blockchain messaging client SDK with end-to-end encryption via @mysten/seal and @mysten/walrus for attachment-data storage.

## Overview

The Sui Messaging SDK provides a complete messaging solution built on the Sui blockchain with the following architecture:

- **Smart Contract**: A Move smart contract deployed on Sui that manages channels, messages, and member permissions
- **End-to-End Encryption**: Uses @mysten/seal's to encrypt message content and metadata
- **Attachment Storage**: Message attachments are split between on-chain and off-chain storage:
  - **On-chain**: Encrypted metadata and blob references are stored in the smart contract
  - **Off-chain**: Encrypted attachment data is stored on Walrus (decentralized storage)
- **Client Extensions**: Built using Sui's client extension system, allowing seamless integration with existing Sui clients

## Installation

```bash
TBD

```

## Setup

The MessagingClient uses Sui's client extension system, which allows you to extend a base Sui client with additional functionality. You start with either a `SuiClient` (JSON-RPC) or `SuiGrpcClient` and extend it with other clients that expose `asClientExtension` or `experimental_asClientExtension` methods.

### Client Extension Pattern

The `$extend` method allows you to compose multiple client extensions into a single client instance. Each extension adds new methods and capabilities to the base client:

**Required Dependencies:**

- **SealClient**: Required for end-to-end encryption functionality. The MessagingClient depends on SealClient for encrypting and decrypting messages.

**Optional Dependencies:**

- **WalrusClient**: Optional for attachment storage.

**Storage Adapter:**
By default, the MessagingClient uses `WalrusStorageAdapter` which stores encrypted attachment data on Walrus (decentralized storage). In this initial alpha version, the WalrusStorageAdapter only uses aggregators/publishers for storage operations.
In the future, it will also support the `@mysten/walrus` sdk client, which for example will enable the upload relay.

If you need different storage behavior, you can implement your own `StorageAdapter` by implementing the `StorageAdapter` interface and passing it to the MessagingClient configuration.

```typescript
import { SuiClient } from "@mysten/sui/client";
import { SuiGrpcClient } from "@mysten/sui-grpc"; // Alternative base client
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import { MessagingClient } from "@mysten/sui-messaging";
import { SealClient } from "@mysten/seal";
import { WalrusClient } from "@mysten/walrus";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

// Not necessary to work with a Signer.
const signer = Ed25519Keypair.generate();

// Option 1: Using SuiClient (JSON-RPC)
const client = new SuiClient({ url: "https://fullnode.testnet.sui.io:443" })
  .$extend(
    SealClient.asClientExtension({
      serverConfigs: [], // Seal server configurations
    })
  )
  .$extend(WalrusClient.asClientExtension())
  .$extend(
    MessagingClient.experimental_asClientExtension({
      network: "testnet", // or "mainnet"
      sessionKeyConfig: {
        address: signer.toSuiAddress(),
        ttlMin: 30,
        signer, // optional, e.g. in frontend apps you typically would not work with Signers
      },
      // Optional: custom storage adapter (if you don't want to use WalrusStorageAdapter)
      // storage: (client) => new CustomStorageAdapter(client, config)
    })
  );

// Option 2: Using SuiGrpcClient (gRPC)
const grpcClient = new SuiGrpcClient({
  network: "testnet",
  transport: new GrpcWebFetchTransport({
    baseUrl: "https://fullnode.testnet.sui.io:443",
  }),
})
  .$extend(SealClient.asClientExtension({ serverConfigs: [] }))
  .$extend(WalrusClient.asClientExtension())
  .$extend(
    MessagingClient.experimental_asClientExtension({
      network: "testnet",
      sessionKeyConfig: {
        address: signer.toSuiAddress(),
        ttlMin: 30,
        signer,
      },
    })
  );

// Access messaging functionality
const messaging = client.messaging; // or grpcClient.messaging
```

### Configuration Options

- `network`: "testnet" | "mainnet" - Uses predefined package configs
- `packageConfig`: Custom package configuration (overrides network)
  // Alternatively you can provide your own managed instance of a @mysten/seal/SessionKey
- `sessionKeyConfig`: Required for encryption/decryption
  - `address`: User's Sui address
  - `ttlMin`: Session key time-to-live in minutes
  - `signer`: Optional Signer for session key operations
- `storage`: Optional custom storage adapter (defaults to WalrusStorageAdapter)
  - If not provided and WalrusClient is available, uses WalrusStorageAdapter
  - If not provided and WalrusClient is not available, you must provide a custom storage adapter
  - Custom storage adapters must implement the `StorageAdapter` interface

## Public Methods

### Channels

- **`getChannelMemberships(request)`** - Get channel memberships for a user with pagination support. Returns a list of channels the user is a member of along with their member cap IDs.

- **`getChannelObjectsByAddress(request)`** - Get channel objects for a user by fetching their memberships first, then retrieving the full channel objects. This is a convenience method that combines membership lookup with channel object fetching.

- **`getChannelObjectsByChannelIds(channelIds)`** - Get channel objects by their IDs. Useful when you already know the channel IDs and need the full channel metadata.

- **`getChannelMembers(channelId)`** - Get all members of a specific channel, including their addresses and member cap IDs. This method queries the channel's permission structure to find all current members.

- **`createChannelFlow(opts)`** - Create a channel creation flow with step-by-step methods. This provides fine-grained control over the channel creation process, allowing you to build, execute, and manage the transaction in stages. CAVEAT: requires 2 separate transactions.

- **`executeCreateChannelTransaction(params)`** - Execute a complete channel creation transaction in one call. This is a convenience method that handles the entire flow internally.

### Messages

- **`sendMessage(...)`** - Create a send message transaction builder function. Returns a function that can be used to build a transaction for sending encrypted messages with optional attachments.

- **`executeSendMessageTransaction(params)`** - Execute a complete send message transaction. This method handles message encryption, attachment processing, and transaction execution.

- **`getChannelMessages(request)`** - Get messages from a channel with pagination support. Supports both forward and backward pagination with configurable limits and cursors.

- **`getLatestMessages(request)`** - Get new messages since the last polling state. This is optimized for real-time messaging applications that need to check for new messages efficiently.

- **`decryptMessage(message, channelId, memberCapId, encryptedKey)`** - Decrypt a message using the provided encryption key. Returns the decrypted text and lazy-loaded attachments that can be downloaded on-demand.

## Integration Tests

The SDK includes comprehensive integration tests that validate the complete messaging flow.

### Test Environment Options

The integration tests support two environments:

- **Localnet**: Uses Docker containers to spin up a local Sui node with indexer and PostgreSQL. Ideal for development and CI/CD pipelines. CAVEAT: seal/walrus are mocked in this case.
- **Testnet**: Uses the public Sui testnet. Requires funded accounts and deployed contracts. Better for testing against real network conditions.

### Running Integration Tests

#### Localnet Tests (Recommended for Development)

Localnet tests are self-contained and don't require external setup:

```bash
# Run all integration tests on localnet
pnpm run test:integration:localnet

# Run specific test files
TEST_ENVIRONMENT=localnet pnpm test integration-write.test.ts
```

#### Testnet Tests

Testnet tests require pre-deployed contracts and funded accounts:

```bash
# 1. First, set up the testnet environment (see Testnet Setup Process below)
pnpm run setup-testnet

# 2. Then run the integration tests
pnpm run test:integration:testnet
```

### Test Data Setup

The integration tests use a sophisticated data preparation system:

#### Integration Write Tests (`integration-write.test.ts`)

- **Simple setup**: Creates fresh channels and messages during test execution
- **No pre-requisites**: Can be run immediately without additional setup
- **Tests**: Channel creation, message sending, and basic functionality

#### Integration Read Tests (`integration-read-v2.test.ts`)

- **Requires test data**: Uses pre-generated test data to avoid spending SUI on each test run
- **Setup required**: Run `pnpm run prepare-test-data` first to create test channels and messages
- **Tests**: Pagination, message decryption, attachment handling, and complex query scenarios

### Testnet Setup Process

For testnet testing, you need to set up funded test accounts and prepare test data. The process involves two main steps:

#### 1. Environment Configuration

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

#### 2. Automated Setup

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

### Test Data Preparation

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

### Environment Variables

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

### Test Scripts

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
