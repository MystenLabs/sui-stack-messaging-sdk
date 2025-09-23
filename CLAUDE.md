# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the Sui Stack Messaging SDK - a complete, end-to-end encrypted messaging solution for Web3 applications built on Sui blockchain. The repository contains:

- **packages/messaging**: TypeScript SDK for messaging with encryption (Seal) and decentralized storage (Walrus)
- **packages/build-scripts**: Custom build tooling for the SDK
- **move/sui_stack_messaging**: Sui smart contracts for channels, messages, and membership management
- **scripts**: E2E test scripts and utilities
- **load-tests**: Performance and load testing infrastructure

This is a **testnet-only alpha** project, not production-ready.

## Development Commands

### Setup and Build

```bash
# Install dependencies (from repository root)
cd packages
pnpm install

# Build all packages
pnpm build

# Build specific package
pnpm turbo build --filter=@mysten/sui-stack-messaging-sdk
```

### Testing

```bash
# From packages/ directory

# Run unit tests
pnpm test

# Run integration tests on localnet (uses Docker, mocks Seal/Walrus)
pnpm run test:integration:localnet

# Run integration tests on testnet (requires setup - see Testing section)
pnpm run test:integration:testnet

# Type checking
pnpm test:typecheck
```

### Linting

```bash
# From packages/ directory

# Check linting and formatting
pnpm lint

# Auto-fix issues
pnpm lint:fix

# Individual tools
pnpm run eslint:check
pnpm run prettier:check
pnpm run eslint:fix
pnpm run prettier:fix
```

### Move Contracts

```bash
# From move/sui_stack_messaging/ directory

# Build contracts
sui move build

# Test contracts
sui move test

# Generate TypeScript bindings (from packages/messaging/)
pnpm run codegen
```

## Architecture

### Client Extension System

The SDK uses Sui's client extension pattern - it extends a base `SuiClient` with messaging functionality. This allows composition with other extensions (SealClient, WalrusClient, etc.).

**Extension chain**: `SuiClient` → `.$extend(SealClient)` → `.$extend(SuiStackMessagingClient)`

- **SealClient** (required): Provides end-to-end encryption for messages and attachments
- **SuiStackMessagingClient**: Adds messaging methods to the client

The resulting client has: `client.core` (Sui), `client.seal` (encryption), `client.messaging` (messaging API).

### Core Components

**TypeScript SDK** (`packages/messaging/src/`):
- `client.ts`: Main MessagingClient with channel/message operations
- `encryption/`: Envelope encryption and session key management using Seal
- `storage/`: Storage adapters (WalrusStorageAdapter for attachments)
- `contracts/`: Auto-generated TypeScript bindings from Move contracts (via `@mysten/codegen`)
- `types.ts`: Type definitions for channels, messages, and API responses

**Move Contracts** (`move/sui_stack_messaging/sources/`):
- `channel.move`: Channel creation, membership, and message storage
- `message.move`: Message objects with encrypted content
- `attachment.move`: Attachment references (content stored on Walrus)
- `member_cap.move`: Membership capabilities for access control
- `encryption_key_history.move`: Per-member encryption key tracking
- `seal_policies.move`: Integration with Seal for encryption approval

### Code Generation

The SDK uses `@mysten/codegen` to auto-generate TypeScript bindings from Move contracts:

1. Move contracts in `move/sui_stack_messaging/sources/`
2. Configuration in `packages/messaging/sui-codegen.config.ts`
3. Generated code in `packages/messaging/src/contracts/`
4. Run: `pnpm run codegen` (also runs lint:fix)

**Important**: Never manually edit files in `src/contracts/` - they're auto-generated.

### Testing Strategy

**Localnet Tests** (`test:integration:localnet`):
- Self-contained with Docker (Sui node + indexer + PostgreSQL)
- Mocks Seal and Walrus for faster testing
- Ideal for CI/CD and development

**Testnet Tests** (`test:integration:testnet`):
- Uses real Sui testnet with deployed contracts
- Requires funded test accounts and environment setup
- Tests against actual Seal/Walrus services

**Test Data**: Integration read tests use pre-generated test data (`prepare-test-data.ts`) to avoid spending SUI on each run. Write tests create fresh data during execution.

## Testnet Setup

For running tests on testnet, you need:

1. **Deployed contracts**: Messaging package and Seal approve contract on testnet
2. **Funded test accounts**: 5 accounts with ~0.1 SUI each
3. **Environment variables**:
   - `TESTNET_PACKAGE_ID`: Deployed messaging package ID
   - `TESTNET_SEAL_APPROVE_PACKAGE_ID`: Seal approve contract package ID
   - `TESTNET_SECRET_KEY`: Main test account secret key
   - `TESTNET_FUNDER_ADDRESS`: Funder account address
   - `TESTNET_FUNDER_SECRET_KEY`: Funder account secret key

Run setup: `pnpm run setup-testnet` (from packages/)

See `test/example-testnet-setup.sh` for a template setup script.

## Package Manager

- **Required**: pnpm >= 9.0.0 (specified in `packages/package.json`)
- **Workspaces**: Uses pnpm workspaces (`pnpm-workspace.yaml`)
- **Build orchestration**: Turbo (`packages/turbo.json`)

## Key Dependencies

- `@mysten/sui`: Sui TypeScript SDK (core blockchain interaction)
- `@mysten/seal`: Encryption library for end-to-end encryption
- `@mysten/walrus`: Decentralized storage for attachments
- `@mysten/codegen`: Code generator for Move → TypeScript bindings
- `vitest`: Test runner for unit and integration tests
- `testcontainers`: Docker containers for localnet testing