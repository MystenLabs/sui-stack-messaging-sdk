## Table of Contents

- [Home - Overview and Installation](./README.md)
- [SDK API Reference](./APIRef.md)
- [Integration Testing](./Testing.md)
- Example App - TBD

# Developer Setup

This guide shows you how to set up the Sui Stack Messaging SDK in your application.

## Client Extension System

The MessagingClient uses Sui's client extension system, which allows you to extend a
base Sui client with additional functionality.

### Why Use Client Extensions?

- **Integrates seamlessly** with your existing Sui client setup
- **Composes naturally** with other client extensions (e.g. other sui ts-sdks like seal, walrus, etc)
- **Provides maximum flexibility** for advanced configurations
- **Enables progressive enhancement** - add messaging to existing applications

### Prerequisites

Before extending your client, ensure you have:

```typescript
import { SuiClient } from "@mysten/sui/client";
import { SuiGrpcClient } from "@mysten/sui-grpc";
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import { SealClient } from "@mysten/seal";
import { SuiStackMessagingClient } from "@mysten/sui-messaging";
```

### Step-by-Step Extension

**Step 1: Create your base client**

Choose your preferred transport:

```typescript
// Option A: JSON-RPC (most common)
const baseClient = new SuiClient({
  network: "testnet",
  url: "https://fullnode.testnet.sui.io:443",
});
```

**Step 2: Extend with SealClient (required for encryption)**

```typescript
const clientWithSeal = baseClient.$extend(
  SealClient.asClientExtension({
    // These are testnet key servers, feel free to use the ones you prefer
    serverConfigs: [
      {
        objectId:
          "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
        weight: 1,
      },
      {
        objectId:
          "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
        weight: 1,
      },
    ], // Seal server configurations
  })
);
```

**Step 3: Extend with SuiStackMessagingClient**

```typescript
const messagingClient = clientWithSeal.$extend(
  SuiStackMessagingClient.experimental_asClientExtension({
    sessionKeyConfig: {
      address: "0x...", // User's Sui address
      ttlMin: 30,
      // signer: optional
    },
    // Choose your storage configuration (see Storage Options below)
    walrusStorageConfig: {
      publisher: "https://publisher.walrus-testnet.walrus.space",
      aggregator: "https://aggregator.walrus-testnet.walrus.space",
      epochs: 1, // For how many walrus-epochs should the attachments be stored
    },
  })
);

// Access messaging functionality
const messaging = messagingClient.messaging;
```

### Complete Extension Examples

**JSON-RPC with Walrus Storage:**

```typescript
const client = new SuiClient({ url: "https://fullnode.testnet.sui.io:443" })
  .$extend(
    SealClient.asClientExtension({
      serverConfigs: [
        {
          objectId:
            "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
          weight: 1,
        },
        {
          objectId:
            "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
          weight: 1,
        },
      ],
    })
  )
  .$extend(
    SuiStackMessagingClient.experimental_asClientExtension({
      sessionKeyConfig: {
        address: "0x...", // User's Sui address
        ttlMin: 30,
        // signer: optional - provide if needed for your use case
      },
      walrusStorageConfig: {
        publisher: "https://publisher.walrus-testnet.walrus.space",
        aggregator: "https://aggregator.walrus-testnet.walrus.space",
        epochs: 1,
      },
    })
  );

// Now you have: client.core, client.seal, client.messaging
```

## Configuration Reference

### Required Dependencies

| Dependency   | Purpose                                            | Required |
| ------------ | -------------------------------------------------- | -------- |
| `SealClient` | End-to-end encryption for messages and attachments | ✅ Yes   |

\*The `WalrusStorageAdapter` works without `WalrusClient` using `publishers` and `aggregators`.
In the future, we plan to support the `WalrusClient` as an option, enabling features like the `upload relay`.

### Seal SessionKey Configuration

Choose **one** of these approaches:

**Option A: Automatic Session Key**

```typescript
sessionKeyConfig: {
  address: "0x...",              // User's Sui address
  ttlMin: 30,                    // Session key lifetime in minutes
  signer,                        // Optional: provide if needed (see Sui docs for Signer usage)
}
```

**Option B: Manual Seal SessionKey Management**

```typescript
sessionKey: myManagedSessionKey; // Your own @mysten/seal/SessionKey instance
```

> **Note**: The `signer` parameter is optional.

### Storage Configuration

Choose **one** of these storage approaches:

**Option A: Walrus Storage (Built-in)**

```typescript
walrusStorageConfig: {
  publisher: "https://publisher.walrus-testnet.walrus.space",
  aggregator: "https://aggregator.walrus-testnet.walrus.space",
  epochs: 1,                     // Storage duration in epochs
}
```

**Option B: Custom Storage Adapter**

```typescript
storage: (client) => new CustomStorageAdapter(client, customConfig);
```

To implement a custom storage adapter, implement the `StorageAdapter` interface:

```typescript
interface StorageAdapter {
  upload(
    data: Uint8Array[],
    options: StorageOptions
  ): Promise<{ ids: string[] }>;
  download(ids: string[]): Promise<Uint8Array[]>;
}
```

### Network Configuration

| Network   | Purpose                 | Package Config          |
| --------- | ----------------------- | ----------------------- |
| `testnet` | Development and testing | Pre-configured          |
| `mainnet` | Production deployment   | Pre-configured          |
| Custom    | Custom deployment       | Provide `packageConfig` |

For custom deployments, provide your own `packageConfig`:

```typescript
packageConfig: {
  packageId: "0x...",
  // If you just deployed the provided move contract from this repo, you don't need to supply this sealApproveCotnract config
  sealApproveContract: {
    packageId: "0x...",
    module: "<the module containing the seal approve function>",
    functionName: "<the name of the entry seal_approve* function>"
  }
}
```

## Next Steps

See the [SDK API Reference](./APIRef.md) for detailed method documentation.

## Troubleshooting

**Common Issues:**

- **"SealClient extension is required"** - Make sure to extend with `SealClient` before `SuiStackMessagingClient`
- **"Must provide either storage or walrusStorageConfig"** - Choose one storage configuration approach
- **"Cannot provide both sessionKey and sessionKeyConfig"** - Use only one session key approach

**Getting Help:**

- Check the [Integration Testing](./Testing.md) guide for setup validation
- Review example implementations in the test files
- Create a GitHub issue for persistent problems

[Back to table of contents](#table-of-contents)
