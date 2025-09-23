## Table of Contents

- [Home - Overview and Installation](./README.md)
- [SDK API Reference](./APIRef.md)
- [Integration Testing](./Testing.md)
- [Example patterns](./Examples.md)

# Developer Setup

This guide shows you how to set up the Sui Stack Messaging SDK in your application.

## Client Extension System

The MessagingClient uses Sui's client extension system, which allows you to extend a base Sui client with additional functionality.

### Why Use Client Extensions?

- **Integrates seamlessly** with your existing Sui client setup
- **Composes naturally** with other client extensions (e.g. other sui ts-sdks like seal, walrus, etc)
- **Provides maximum flexibility** for advanced configurations
- **Enables progressive enhancement** - add messaging to existing applications

### Prerequisites

Before extending your client, ensure you have:

```typescript
import { SuiClient } from "@mysten/sui/client";
import { SealClient } from "@mysten/seal";
import { SuiStackMessagingClient } from "@mysten/sui-messaging";
```

### Step-by-Step Extension

**Step 1: Create your base client**

```typescript
const baseClient = new SuiClient({
  url: "https://fullnode.testnet.sui.io:443",
});
```

**Step 2: Extend with SealClient (required for encryption)**

The SealClient configures which key servers to use for encryption operations:

```typescript
const clientWithSeal = baseClient.$extend(
  SealClient.asClientExtension({
    // Testnet key servers
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
);
```

**Step 3: Extend with SuiStackMessagingClient**

```typescript
const messagingClient = clientWithSeal.$extend(
  SuiStackMessagingClient.experimental_asClientExtension({
    // Session key configuration (choose one approach - see below)
    sessionKeyConfig: {
      address: "0x...", // User's Sui address
      ttlMin: 30, // Session key lifetime in minutes
      // signer: optional - provide if needed for your use case
    },

    // Storage configuration (choose one approach - see below)
    walrusStorageConfig: {
      publisher: "https://publisher.walrus-testnet.walrus.space",
      aggregator: "https://aggregator.walrus-testnet.walrus.space",
      epochs: 1, // Storage duration in Walrus epochs
    },

    // Optional: Seal operation configuration
    sealConfig: {
      threshold: 2, // Number of key servers required (default: 2)
    },

    // Optional: Custom package configuration for custom deployments
    // packageConfig: { ... }
  })
);

// Access messaging functionality
const messaging = messagingClient.messaging;
```

### Complete Extension Example

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
        address: "0x...",
        ttlMin: 30,
      },
      walrusStorageConfig: {
        publisher: "https://publisher.walrus-testnet.walrus.space",
        aggregator: "https://aggregator.walrus-testnet.walrus.space",
        epochs: 1,
      },
      sealConfig: {
        threshold: 2,
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

> [!NOTE] 
> The `WalrusStorageAdapter` works without `WalrusClient` by using direct publisher/aggregator URLs. In the future, we plan to support the `WalrusClient` as an option, enabling features like the upload relay.

### Seal Session Key Configuration

Choose **one** of these approaches:

#### Option A: Manual Session Key Management

Provide your own managed `@mysten/seal/SessionKey` instance:

```typescript
sessionKey: SessionKey; // Your own SessionKey instance
```

**Example:**

```typescript
import { SessionKey } from "@mysten/seal";

const mySessionKey = await SessionKey.create(/* ... */);

SuiStackMessagingClient.experimental_asClientExtension({
  sessionKey: mySessionKey,
  // ... other config
});
```

#### Option B: Automatic Session Key

The SDK manages the session key lifecycle automatically:

```typescript
sessionKeyConfig: {
  address: string;       // User's Sui address (required)
  ttlMin: number;        // Session key lifetime in minutes (required)
  signer?: Signer;       // Optional: Signer for session key creation
  mvrName?: string;      // Optional: MVR name for session key
}
```

**Example:**

```typescript
sessionKeyConfig: {
  address: "0x123...",
  ttlMin: 30,
}
```

> **Important:** You cannot provide both `sessionKey` and `sessionKeyConfig`. Choose one approach.

### Storage Configuration

Choose **one** of these storage approaches:

#### Option A: Walrus Storage (Built-in)

Use Walrus decentralized storage for attachments:

```typescript
walrusStorageConfig: {
  publisher: string; // Walrus publisher URL (required)
  aggregator: string; // Walrus aggregator URL (required)
  epochs: number; // Storage duration in Walrus epochs (required)
}
```

**Example:**

```typescript
walrusStorageConfig: {
  publisher: "https://publisher.walrus-testnet.walrus.space",
  aggregator: "https://aggregator.walrus-testnet.walrus.space",
  epochs: 1,
}
```

#### Option B: Custom Storage Adapter

Implement your own storage backend:

```typescript
storage: (client: MessagingCompatibleClient) => StorageAdapter;
```

**Example:**

```typescript
import { StorageAdapter } from "@mysten/sui-stack-messaging-sdk";

class MyCustomStorage implements StorageAdapter {
  async upload(
    data: Uint8Array[],
    options: StorageOptions
  ): Promise<{ ids: string[] }> {
    // Your upload logic
  }

  async download(ids: string[]): Promise<Uint8Array[]> {
    // Your download logic
  }
}

SuiStackMessagingClient.experimental_asClientExtension({
  storage: (client) => new MyCustomStorage(client),
  // ... other config
});
```

> **Important:** You must provide either `walrusStorageConfig` or `storage`. The SDK requires explicit storage configuration.

### Seal Configuration (Optional)

Configure Seal encryption operation parameters:

```typescript
sealConfig?: {
  threshold?: number;    // Number of key servers required (default: 2)
}
```

**Important distinction:**

- **SealClient configuration** (`SealClient.asClientExtension`): Defines **which** key servers to use
- **MessagingClient sealConfig**: Defines operation parameters like encryption **threshold**

**Example:**

```typescript
// SealClient: Configure key servers
SealClient.asClientExtension({
  serverConfigs: [
    { objectId: "0x...", weight: 1 },
    { objectId: "0x...", weight: 1 },
    { objectId: "0x...", weight: 1 },
  ],
});

// MessagingClient: Configure threshold (how many servers must participate)
SuiStackMessagingClient.experimental_asClientExtension({
  sealConfig: {
    threshold: 2, // Require 2 out of 3 key servers
  },
  // ... other config
});
```

### Network Configuration

The SDK auto-detects the network from your `SuiClient` and uses pre-configured package IDs:

| Network   | Detection              | Package Config  |
| --------- | ---------------------- | --------------- |
| `testnet` | Auto-detected          | Pre-configured  |
| `mainnet` | Auto-detected          | Pre-configured  |
| Custom    | Requires configuration | Manual override |

#### Custom Network Deployment

For custom deployments, provide your own `packageConfig`:

```typescript
packageConfig: {
  packageId: string;                    // Your deployed package ID (required)
  sealApproveContract?: {               // Optional: custom seal approve contract
    packageId: string;                  // Contract package ID
    module: string;                     // Module name (default: "seal_policies")
    functionName: string;               // Function name (default: "seal_approve")
  }
}
```

**Example:**

```typescript
SuiStackMessagingClient.experimental_asClientExtension({
  packageConfig: {
    packageId: "0xabc123...",
    sealApproveContract: {
      packageId: "0xabc123...",
      module: "seal_policies",
      functionName: "seal_approve",
    },
  },
  // ... other config
});
```

> **Note:** If you deployed the Move contract from this repository without modifications, you don't need to provide `sealApproveContract` - the defaults will work.

## Configuration Options Summary

### Minimal Configuration

```typescript
SuiStackMessagingClient.experimental_asClientExtension({
  // Session key (choose one)
  sessionKeyConfig: { address: "0x...", ttlMin: 30 },

  // Storage (choose one)
  walrusStorageConfig: {
    publisher: "https://publisher.walrus-testnet.walrus.space",
    aggregator: "https://aggregator.walrus-testnet.walrus.space",
    epochs: 1,
  },
});
```

### Full Configuration

```typescript
SuiStackMessagingClient.experimental_asClientExtension({
  // Session key (choose one)
  sessionKeyConfig: {
    address: "0x...",
    ttlMin: 30,
    signer: mySigner, // optional
    mvrName: "my-mvr", // optional
  },

  // Storage (choose one)
  walrusStorageConfig: {
    publisher: "https://publisher.walrus-testnet.walrus.space",
    aggregator: "https://aggregator.walrus-testnet.walrus.space",
    epochs: 1,
  },

  // Seal operation config (optional)
  sealConfig: {
    threshold: 2,
  },

  // Custom package (optional)
  packageConfig: {
    packageId: "0x...",
    sealApproveContract: {
      packageId: "0x...",
      module: "seal_policies",
      functionName: "seal_approve",
    },
  },
});
```

## Next Steps

See the [SDK API Reference](./APIRef.md) for detailed method documentation.

## Troubleshooting

### Common Issues

- **"SealClient extension is required"** - Make sure to extend with `SealClient` before `SuiStackMessagingClient`
- **"Must provide either storage or walrusStorageConfig"** - Choose one storage configuration approach
- **"Cannot provide both sessionKey and sessionKeyConfig"** - Use only one session key approach

### Getting Help

- Check the [Integration Testing](./Testing.md) guide for setup validation
- Review example implementations in the test files
- Create a GitHub issue for persistent problems

[Back to table of contents](#table-of-contents)
