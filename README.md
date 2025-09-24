# Sui Stack Messaging SDK

The Sui Stack Messaging SDK provides a complete, end-to-end encrypted messaging solution for Web3 applications. It combines three key components:

- [Sui](https://sui.io/) smart contracts to manage channels, messages, membership, and encrypted message storage.
- [Walrus](https://walrus.xyz/) decentralized storage to store encrypted attachments in a verifiable and permissionless way.
- [Seal](https://seal.mystenlabs.com/) encryption to secure both messages and attachments, with programmable access control policies.

The SDK enables developers to integrate secure, wallet-linked messaging directly into their apps without building custom backends. Conversations are private by default, recoverable across devices, and composable with other applications.

> [!IMPORTANT]
> The Sui Stack Messaging SDK is currently in **alpha** and available on **Testnet only**. It is not production-ready and is intended for experimentation and developer feedback as we prepare for beta and GA.

## Features

- **1:1 and Group Messaging**: Create direct channels between two users or multi-member groups with defined access rules.
- **End-to-end encryption**: Encrypt both messages (stored on Sui) and attachments (stored on Walrus) with Seal.
- **On-chain message storage**: Store encrypted message objects and metadata directly on Sui for verifiable and auditable communication.
- **Decentralized attachment storage**: Store encrypted attachments on Walrus for scalable, content-addressed availability. References and metadata live on-chain in Sui.
- **Client extensions**: Built on Sui’s client extension system, allowing seamless integration of messaging into existing wallets and dApps. Developers can extend functionality without maintaining custom backends.
- **Programmable messaging flows**: Use Sui smart contracts to trigger messaging based on events, such as asset transfers, governance votes, or content unlocks.
- **Recoverability**: Enable users to sync conversations across devices without relying on centralized servers.

## Use cases

- **Customer support**: Integrate private support chat directly in your app. Conversations remain wallet-linked, encrypted, and recoverable.
- **Community engagement**: Provide token-gated channels or DAO chat features with verified membership policies.
- **Cross-app workflows**: Allow apps to coordinate through secure messaging, such as an NFT marketplace notifying a DeFi app of a collateral action, or enabling negotiation between users across apps.
- **Ai agent coordination**: Enable agents to communicate securely with apps or other agents using the SDK as a verifiable, encrypted message bus.
- **Event-driven communication**: Trigger notifications or chat threads directly from on-chain events, such as trade confirmations or governance outcomes.
- **Social messaging apps**: Use the SDK as a foundation to create privacy-preserving, wallet-linked social messaging platforms that benefit from end-to-end encryption and recoverability.

## Non-goals

- **Unauthenticated messaging**: Anonymous or unauthenticated communication is out of scope. All messaging relies on verifiable Sui identities.
- **Storage assumptions**: The SDK defaults to storing messages on Sui and attachments on Walrus, to align with the decentralization ethos. However, builders are free to extend the client to integrate with other storage backends if they prefer.
- **Forward secrecy guarantees**: While Seal provides strong end-to-end encryption and recoverability, full forward secrecy (where past messages remain secure even if keys are compromised later) is not part of the current design.

## Installation

> [!NOTE]
> The SDK is not yet published to npm. Follow the manual installation steps below.

### Option 1: Install from Tarball (Recommended)

1. **Clone and build the SDK:**

```bash
git clone https://github.com/MystenLabs/sui-stack-messaging-sdk.git
cd sui-stack-messaging-sdk/packages/messaging
pnpm install
pnpm build
pnpm pack
```

This generates a tarball file: `mysten-messaging-0.0.1.tgz`

2. **Install in your project:**

```bash
# From the SDK directory (sui-stack-messaging-sdk/packages/messaging)
# Copy the tarball to your project and install with full path
cp mysten-messaging-0.0.1.tgz /path/to/your/project/
cd /path/to/your/project
pnpm add $(pwd)/mysten-messaging-0.0.1.tgz
```

3. **Import and use:**

```typescript
import { SuiStackMessagingClient } from "@mysten/messaging";
```

### Option 2: Copy Package Directly

For developers who want to modify the SDK or integrate it directly into their monorepo:

```bash
# Clone the repository
git clone https://github.com/MystenLabs/sui-stack-messaging-sdk.git

# Copy the messaging package to your project
cp -r sui-stack-messaging-sdk/packages/messaging /path/to/your/project/packages/

# Install dependencies and build
cd /path/to/your/project/packages/messaging
pnpm install
pnpm build
```

Then configure your project's `package.json` to reference the local package:

```json
{
  "dependencies": {
    "@mysten/messaging": "workspace:*"
  }
}
```

### Requirements

- Node.js >=18
- pnpm >=10.17.0

Check out instructions for [Developer Setup](./Setup.md).

## Smart Contract Deployment

The SDK requires a Move smart contract to be deployed on Sui to manage channels, messages, and membership. The source code is located in [`move/sui_stack_messaging/`](./move/sui_stack_messaging/).

**Deploy the contract:**

```bash
cd move/sui_stack_messaging
sui move build
sui client publish --gas-budget 100000000
```

**Configure the SDK with your deployed package ID:**

```typescript
import { SuiStackMessagingClient } from "@mysten/messaging";

const client = suiClient.$extend(
  SuiStackMessagingClient.experimental_asClientExtension({
    packageConfig: {
      packageId: "0x<your-deployed-package-id>",
    },
    // ... other config
  })
);
```

## Contact Us

For questions about the SDK, use case discussions, or integration support, contact the team on [Sui Discord](https://discord.com/channels/916379725201563759/1417696942074630194) or create a Github issue.

## Table of Contents

- [Developer Setup](./Setup.md)
- [SDK API Reference](./APIRef.md)
- [Integration Testing](./Testing.md)
- [Example patterns](./Examples.md)
