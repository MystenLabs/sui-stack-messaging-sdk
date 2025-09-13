# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Sui Stack Messaging SDK - a comprehensive, end-to-end encrypted messaging solution for Web3 applications built on Sui blockchain. The SDK integrates Sui smart contracts, Walrus decentralized storage, and Seal encryption for secure messaging.

## Key Architecture Components

### Monorepo Structure
- `packages/` - TypeScript SDK and build tools
- `move/` - Sui Move smart contracts
- `load-tests/` - Performance testing infrastructure
- `scripts/` - Utility scripts

### Core SDK Architecture
The SDK provides client extension via the `$extend()` method:
- Base client: `SuiClient` (JSON-RPC) or `SuiGrpcClient` (gRPC) 
- Required extension: `SealClient` for encryption/decryption
- Optional extension: `WalrusClient` (not required - `WalrusStorageAdapter` works without it)
- Main extension: `SuiStackMessagingClient.experimental_asClientExtension()`

### Storage Adapters
Default: `WalrusStorageAdapter` stores encrypted attachments on Walrus decentralized storage. Custom adapters can implement the `StorageAdapter` interface.

## Development Commands

### Build Commands
```bash
# Build all packages
pnpm run build

# Build from packages root
cd packages && pnpm run build
```

### Testing Commands
```bash
# Unit tests only
pnpm test

# All integration tests
pnpm run test:integration

# Localnet integration tests (recommended for development)
pnpm run test:integration:localnet

# Testnet integration tests (requires setup)
pnpm run test:integration:testnet
```

### Linting and Code Quality
```bash
# Lint check
pnpm run lint

# Lint and fix
pnpm run lint:fix

# ESLint only
pnpm run eslint:check

# Prettier only  
pnpm run prettier:check
```

### Code Generation
```bash
# Generate TypeScript bindings from Move contracts
cd packages/messaging && pnpm run codegen
```

## Smart Contracts (Move)

Located in `move/sui_stack_messaging/sources/`:
- `channel.move` - Channel creation and management
- `message.move` - Message objects and operations
- `attachment.move` - File attachment handling
- `auth.move` - Authentication and access control
- `member_cap.move` - Member capability objects
- `creator_cap.move` - Creator capability objects
- `config.move` - Package configuration

## Integration Testing Setup

### Localnet (Recommended)
Self-contained using Docker containers with mocked Seal/Walrus:
```bash
pnpm run test:integration:localnet
```

### Testnet
Requires funded accounts and deployed contracts:
```bash
# 1. Set up environment (customize example-testnet-setup.sh)
export TESTNET_FUNDER_ADDRESS="0x..."
export TESTNET_FUNDER_SECRET_KEY="..."
export TESTNET_PACKAGE_ID="0x..."
export TESTNET_SECRET_KEY="..."

# 2. Run setup
pnpm run setup-testnet

# 3. Run tests
pnpm run test:integration:testnet
```

## Package Manager

Uses pnpm with workspace configuration. All commands should be run with pnpm, not npm.

## Network Configuration

- Development: Use localnet for faster iteration
- Testing: Testnet available with proper setup
- Production: Mainnet support (alpha - testnet only currently)