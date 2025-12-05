# Sui Stack Messaging SDK

The Sui Stack Messaging SDK provides a complete, end-to-end encrypted messaging solution for Web3 applications. It combines three key components:

- [Sui](https://sui.io/) smart contracts to manage channels, messages, membership, and encrypted message storage.
- [Walrus](https://walrus.xyz/) decentralized storage to store encrypted attachments in a verifiable and permissionless way.
- [Seal](https://seal.mystenlabs.com/) encryption to secure both messages and attachments, with programmable access control policies.

The SDK enables developers to integrate secure, wallet-linked messaging directly into their apps without building custom backends. Conversations are private by default, recoverable across devices, and composable with other applications.

Try an example app built using the SDK at [https://chatty.wal.app/](https://chatty.wal.app/#). Also refer to other [Example patterns](./Examples.md).

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

Refer to the [Installation Guide](./Installation.md).

## Contact Us

For questions about the SDK, use case discussions, or integration support, contact the team on [Sui Discord](https://discord.com/channels/916379725201563759/1417696942074630194) or create a Github issue.

## Table of Contents

- [Installation Guide](./Installation.md)
- [Developer Setup](./Setup.md)
- [SDK API Reference](./APIRef.md)
- [Integration Testing](./Testing.md)
- [Example patterns](./Examples.md)
- [Logging](./logging.md)
