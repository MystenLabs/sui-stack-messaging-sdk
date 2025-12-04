## Table of Contents

- [Home](./README.md)
- [Installation Guide](./Installation.md)
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
import { messaging } from "@mysten/messaging";
```

### Step-by-Step extension

**Step 1: Create your base client with MVR integration**

```typescript
const baseClient = new SuiClient({
  url: "https://fullnode.testnet.sui.io:443",
  mvr: {
    overrides: {
      packages: {
        '@local-pkg/sui-stack-messaging': "0x984960ebddd75c15c6d38355ac462621db0ffc7d6647214c802cd3b685e1af3d", // Or provide your own package ID
      },
    },
  },
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
          "0xa...",
        weight: 1,
      },
      {
        objectId:
          "0xb...",
        weight: 1,
      },
    ],
  })
);
```

Refer to [verified key servers](https://seal-docs.wal.app/Pricing/#verified-key-servers) for the list of verified key servers on Testnet and Mainnet.

**Step 3: Extend with messaging**

```typescript
const messagingClient = clientWithSeal.$extend(
  messaging({
    // Session key configuration (choose one of the available approaches - see below)
    sessionKeyConfig: {
      address: "0x...", // User's Sui address
      ttlMin: 30, // Session key lifetime in minutes
      // signer: optional - provide if needed for your use case
    },

    // Storage configuration (choose one of the available approaches - see below)
    walrusStorageConfig: {
      publisher: "https://publisher.walrus-testnet.walrus.space", // provide your preferred publisher URL
      aggregator: "https://aggregator.walrus-testnet.walrus.space", // provide your preferred aggregator URL
      epochs: 1, // Storage duration in Walrus epochs
    },

    // Optional: Seal operation configuration
    sealConfig: {
      threshold: 2, // Number of key servers required (default: 2)
    },

    // Optional: if using a smart contract specific to your app (see below for full config)
    packageConfig: { ... }
  })
);

// Access messaging functionality
const msg = messagingClient.messaging;
```

### Complete extension example

```typescript
const client = new SuiClient({
  url: "https://fullnode.testnet.sui.io:443",
  mvr: {
    overrides: {
      packages: {
        '@local-pkg/sui-stack-messaging': "0x984960ebddd75c15c6d38355ac462621db0ffc7d6647214c802cd3b685e1af3d", // Or provide your own package ID
      },
    },
  },
})
  .$extend(
    SealClient.asClientExtension({
      serverConfigs: [
        {
          objectId:
            "0xa...",
          weight: 1,
        },
        {
          objectId:
            "0xb...",
          weight: 1,
        },
      ],
    })
  )
  .$extend(
    messaging({
      sessionKeyConfig: {
        address: "0x...",
        ttlMin: 30,
      },
      walrusStorageConfig: {
        publisher: "https://publisher.walrus-testnet.walrus.space", // provide your preferred publisher URL
        aggregator: "https://aggregator.walrus-testnet.walrus.space", // provide your preferred aggregator URL
        epochs: 1,
      },
      sealConfig: {
        threshold: 2,
      },
      packageConfig: { ... }, // if using smart contract specific to your app
    })
  );

// Now you have: client.core, client.seal, client.messaging
```

## Configuration reference

### Required dependencies

| Dependency   | Purpose                                            | Required |
| ------------ | -------------------------------------------------- | -------- |
| `SealClient` | End-to-end encryption and decryption for messages and attachments | ✅ Yes |
| Sui smart contract | Your app specific smart contract to manage channels, messages, and membership | No (it's optional) |

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

messaging({
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

messaging({
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
messaging({
  sealConfig: {
    threshold: 2, // Require 2 out of 3 key servers
  },
  // ... other config
});
```

### Smart contract configuration

You may provide a smart contract specific to your app. Else the package deployed on `Testnet` will be used - `0x984960ebddd75c15c6d38355ac462621db0ffc7d6647214c802cd3b685e1af3d`. Check out the [relevant installation instructions](./Installation.md#smart-contract-deployment).

If providing your own package, specify your own `packageConfig`:

```typescript
packageConfig: {
  packageId: string;                    // Your smart contract package ID (required)
  sealApproveContract?: {               // Required if your Seal access policy package is different from the main package
    packageId: string;                  // Seal access policy package ID
    module: string;                     // Module name (default: "seal_policies")
    functionName: string;               // Function name (default: "seal_approve")
  }
}
```

**Example:**

```typescript
messaging({
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
