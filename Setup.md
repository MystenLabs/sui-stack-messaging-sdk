## Table of Contents

- [Home - Overview and Installation](./README.md)
- [SDK API Reference](./APIRef.md)
- [Integration Testing](./Testing.md)

# Developer Setup

The `MessagingClient` uses Sui’s client extension system. This system lets you extend a base Sui client with additional functionality. Start with either a `SuiClient` (JSON-RPC) or a `SuiGrpcClient`, and then extend it with clients that expose the `asClientExtension` or `experimental_asClientExtension` methods.

## Client Extension Pattern

Use the `$extend` method to compose multiple client extensions into a single client instance. Each extension adds new methods and capabilities to the base client.

**Required Dependencies:**

- **SealClient**: Provides end-to-end encryption. The `MessagingClient` relies on `SealClient` to encrypt and decrypt messages.

**Optional Dependencies:**

- **WalrusClient**: Provides decentralized attachment storage.

**Storage Adapter:**

By default, the `MessagingClient` uses `WalrusStorageAdapter`. This adapter stores encrypted attachment data on Walrus using aggregators and publishers. In future versions, the adapter will also support the `@mysten/walrus` SDK client, which will enable features like the upload relay.

You can implement a custom `StorageAdapter` by creating a class that implements the `StorageAdapter` interface and passing it into the `MessagingClient` configuration.

## Example Setup

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

- `network`: `testnet` | `mainnet` - Uses predefined package configurations
- `packageConfig`: Custom package configuration. Overrides the network option. You can also provide a managed instance of a `@mysten/seal/SessionKey`.
- `sessionKeyConfig`: Required for encryption and decryption
  - `address`: User's Sui address
  - `ttlMin`: Time-to-live for the session key, in minutes
  - `signer`: Optional Signer for session key operations
- `storage`: Optional custom storage adapter (defaults to `WalrusStorageAdapter`)
  - If not provided and `WalrusClient` is available, the SDK uses `WalrusStorageAdapter`
  - If not provided and `WalrusClient` is not available, you must provide a custom storage adapter
  - Custom storage adapter must implement the `StorageAdapter` interface

[Back to table of contents](#table-of-contents)