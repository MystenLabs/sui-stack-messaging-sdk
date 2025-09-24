## Table of Contents

- [Home - Overview and Installation](./README.md)
- [SDK API Reference](./APIRef.md)
- [Integration Testing](./Testing.md)
- [Example patterns](./Examples.md)

# Developer Setup

This guide shows you how to gte started with the Sui Stack Messaging SDK in your application.

## Client extension system

The `MessagingClient` uses Sui's client extension system, which allows you to extend a base Sui client with additional functionality.

### Why use client extensions?

- **Integrates seamlessly** with your existing Sui client setup
- **Composes naturally** with other client extensions (e.g. other ts-sdks like Seal, Walrus, etc)
- **Provides maximum flexibility** for advanced configurations
- **Enables progressive enhancement** and add messaging to existing applications

### Pre-requisites

Before extending your client, ensure you have:

```typescript
import { SuiClient } from "@mysten/sui/client";
import { SealClient } from "@mysten/seal";
import { SuiStackMessagingClient } from "@mysten/sui-messaging";
```

### Step-by-Step extension

**Step 1: Create your base client**

```typescript
const baseClient = new SuiClient({
  url: "https://fullnode.testnet.sui.io:443",
});
```

**Step 2: Extend with SealClient (required for encryption)**

The `SealClient` configures which key servers to use for encryption and decryption:

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

Refer to [verified key servers](https://seal-docs.wal.app/Pricing/#verified-key-servers) for the list of verified key servers on Testnet and Mainnet.

**Step 3: Extend with SuiStackMessagingClient**

```typescript
const messagingClient = clientWithSeal.$extend(
  SuiStackMessagingClient.experimental_asClientExtension({
    // Session key configuration (choose one of the available approaches - see below)
    sessionKeyConfig: {
      address: "0x...", // User's Sui address
      ttlMin: 30, // Session key lifetime in minutes
      // signer: optional - provide if needed for your use case
    },

    // Storage configuration (choose one of the available approaches - see below)
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

### Complete extension example

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

## Configuration reference

### Required dependencies

| Dependency   | Purpose                                            | Required |
| ------------ | -------------------------------------------------- | -------- |
| `SealClient` | End-to-end encryption and decryption for messages and attachments | ✅ Yes |

> [!NOTE] 
> The `WalrusStorageAdapter` works without `WalrusClient` by using direct publisher and aggregator URLs. In future, we plan to support the `WalrusClient` as an option, enabling features like the upload relay.

### Seal session key configuration

You must choose **one** of the following approaches:

#### Option A: Manual session key management

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

#### Option B: Automatic session key management

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

### Storage configuration

You must choose **one** of the following approaches to specify the storage configuration:

#### Option A: Walrus storage (built-in)

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

#### Option B: Custom storage adapter

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

### Other Seal configuration (optional)

You can optionally configure the following parameters for Seal encryption and decryption:

```typescript
sealConfig?: {
  threshold?: number;    // Number of key servers required (default: 2)
}
```

#### Distinction between the two Seal configurations

- `SealClient` configuration (`SealClient.asClientExtension`): Defines **which** key servers to use
- `MessagingClient` sealConfig: Defines operational parameters like encryption **threshold**

Refer to [Seal design](https://seal-docs.wal.app/Design/) and [Seal developer guide](https://seal-docs.wal.app/UsingSeal/) for relevant information.

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

### Network configuration

The SDK auto-detects the network from your `SuiClient` and uses pre-configured package IDs:

| Network   | Detection              | Package Config  |
| --------- | ---------------------- | --------------- |
| `testnet` | Auto-detected          | Pre-configured  |
| `mainnet` | Auto-detected          | Pre-configured  |
|  Custom   | Requires configuration | Manual override |

#### Custom network deployment

For custom deployments, provide your own `packageConfig`:

```typescript
packageConfig: {
  packageId: string;                    // Your deployed package ID (required)
  sealApproveContract?: {               // Optional: custom seal access policy contract
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

> [!Note] 
> If you deploy the Move contract from this repository without any modifications, you don't need to provide `sealApproveContract` - the defaults should work.

## Summary of the configuration options

### Minimal configuration

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

### Advanced configuration

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

## Next steps

See the [SDK API Reference](./APIRef.md) for details of the available SDK methods.

## Troubleshooting

### Common issues

- `SealClient extension is required` - Make sure to extend with `SealClient` before `SuiStackMessagingClient`.
- `Must provide either storage or walrusStorageConfig` - Choose one of the storage configuration approaches.
- `Cannot provide both sessionKey and sessionKeyConfig` - Choose one of the Seal session key approaches.

### Getting help

- Check the [Integration Testing](./Testing.md) guide for setup validation
- Review example implementations in the test files and also [example patterns](./Examples.md)
- [Contact Us](./README.md#contact-us)

[Back to table of contents](#table-of-contents)
