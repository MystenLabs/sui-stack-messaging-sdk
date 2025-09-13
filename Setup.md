## Table of Contents

- [Home - Overview and Installation](./README.md)
- [SDK API Reference](./APIRef.md)
- [Integration Testing](./Testing.md)
- Example App - TBD

# Developer Setup

This guide shows you how to set up the Sui Stack Messaging SDK in your application.

## Overview: Two Ways to Get Started

The Sui Stack Messaging SDK offers two approaches for integration:

1. **🎯 Client Extension System (Recommended)** - Extend your existing Sui client with messaging capabilities
2. **⚡ Static Create Method** - All-in-one setup that handles client extension internally

## Method 1: Client Extension System (Recommended)

### Why Use Client Extensions?

The client extension pattern is the **recommended approach** because it:

- **Integrates seamlessly** with your existing Sui client setup
- **Composes naturally** with other client extensions (e.g. other sui ts-sdks like seal, walrus, etc)
- **Provides maximum flexibility** for advanced configurations
- **Enables progressive enhancement** - add messaging to existing applications
- **Clearer separation** You have a clear understanding of the client dependencies with their separate individual configurations

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
  url: "https://fullnode.testnet.sui.io:443",
});

// Option B: gRPC (will eventually be the default)
const baseClient = new SuiGrpcClient({
  network: "testnet",
  transport: new GrpcWebFetchTransport({
    baseUrl: "https://fullnode.testnet.sui.io:443",
  }),
});
```

**Step 2: Extend with SealClient (required for encryption)**

```typescript
const clientWithSeal = baseClient.$extend(
  SealClient.asClientExtension({
    serverConfigs: [], // Seal server configurations
  })
);
```

**Step 3: Extend with MessagingClient**

```typescript
const messagingClient = clientWithSeal.$extend(
  SuiStackMessagingClient.experimental_asClientExtension({
    network: "testnet", // or "mainnet"
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
      serverConfigs: [],
    })
  )
  .$extend(
    SuiStackMessagingClient.experimental_asClientExtension({
      network: "testnet",
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

**gRPC with Custom Storage:**

```typescript
const grpcClient = new SuiGrpcClient({
  network: "testnet",
  transport: new GrpcWebFetchTransport({
    baseUrl: "https://fullnode.testnet.sui.io:443",
  }),
})
  .$extend(SealClient.asClientExtension({ serverConfigs: [] }))
  .$extend(
    SuiStackMessagingClient.experimental_asClientExtension({
      network: "testnet",
      sessionKeyConfig: {
        address: "0x...",
        ttlMin: 30,
        // signer: optional
      },
      storage: (client) => new CustomStorageAdapter(client, customConfig),
    })
  );
```

## Method 2: Static Create Method (Alternative)

For scenarios where you want the SDK to handle client extension setup automatically, you can use the static `create` method:

```typescript
import { SuiStackMessagingClient } from "@mysten/sui-messaging";

// Automated client extension setup
const client = SuiStackMessagingClient.create({
  transport: "jsonrpc", // or "grpc"
  network: "testnet",
  seal: {
    serverConfigs: [],
  },
  walrusStorage: {
    publisher: "https://publisher.walrus-testnet.walrus.space",
    aggregator: "https://aggregator.walrus-testnet.walrus.space",
    epochs: 1,
  },
  sessionKeyConfig: {
    address: "0x...", // User's Sui address
    ttlMin: 30,
    // signer: optional - provide if needed for your use case
  },
});

const messaging = client.messaging;
```

**When to use client extensions instead:**

- ✅ Integration with existing Sui client setup
- ✅ Using multiple client extensions
- ✅ Fine-grained control over client configuration
- ✅ Production applications with complex client architectures

**When to use the static create method:**

- ✅ When you want the SDK to handle extension orchestration

## Configuration Reference

### Required Dependencies

| Dependency     | Purpose                                            | Required |
| -------------- | -------------------------------------------------- | -------- |
| `SealClient`   | End-to-end encryption for messages and attachments | ✅ Yes   |
| `WalrusClient` | Advanced Walrus SDK features (planned as optional) | ❌ No\*  |

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
  sealApproveContract: {
    packageId: "0x...",
    // ... other seal config
  },
  sealSessionKeyTTLmins: 30,
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
