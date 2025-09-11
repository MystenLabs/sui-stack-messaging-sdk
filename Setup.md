## Table of Contents

[Home - Overview and Installation](./README.md)
[SDK API Reference](./APIRef.md)
[Integration Testing](./Testing.md)
Example App - TBD

# Developer Setup

The MessagingClient uses Sui's client extension system, which allows you to extend a base Sui client with additional functionality. You start with either a `SuiClient` (JSON-RPC) or `SuiGrpcClient` and extend it with other clients that expose `asClientExtension` or `experimental_asClientExtension` methods.

## Client Extension Pattern

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

## Configuration Options

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

[Back to table of contents](#table-of-contents)