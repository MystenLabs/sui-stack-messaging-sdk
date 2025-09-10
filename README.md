# sui-stack-messaging-sdk

A Sui blockchain messaging client sdk with end-to-end encryption via @mysten/seal and @mysten/walrus for attachment-data storage.

## Installation

```bash
TBD

```

## Setup

Caveat: The MessagingClient constructor is private. It must be instantiated as a client extension, providing the necessary dependencies (SealClient, WalrusClient):

```typescript
import { SuiClient } from "@mysten/sui/client";
import { MessagingClient } from "@mysten/sui-messaging";
import { SealClient } from "@mysten/seal";
import { WalrusClient } from "@mysten/walrus";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const signer = Ed25519Keypair.generate();

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
        signer,
      },
      // Optional: custom storage adapter
      // storage: (client) => new CustomStorageAdapter(client, config)
    })
  );
```

### Configuration Options

- `network`: "testnet" | "mainnet" - Uses predefined package configs
- `packageConfig`: Custom package configuration (overrides network)
- `sessionKeyConfig`: Required for encryption/decryption
  - `address`: User's Sui address
  - `ttlMin`: Session key time-to-live in minutes
  - `signer`: Signer for session key operations
- `storage`: Optional custom storage adapter (defaults to WalrusStorageAdapter)

## Public Methods

### Channels

- `getChannelMemberships(request)` - Get channel memberships for a user
- `getChannelObjectsByAddress(request)` - Get channel objects for a user
- `getChannelObjectsByChannelIds(channelIds)` - Get channel objects by channel IDs
- `getChannelMembers(channelId)` - Get all members of a channel
- `createChannelFlow(opts)` - Create a channel creation flow
- `executeCreateChannelTransaction(params)` - Execute a create channel transaction

### Messages

- `sendMessage(...)` - Create a send message transaction builder
- `executeSendMessageTransaction(params)` - Execute a send message transaction
- `getChannelMessages(request)` - Get messages from a channel with pagination
- `getLatestMessages(request)` - Get new messages since last polling state
- `decryptMessage(message, channelId, memberCapId, encryptedKey)` - Decrypt a message
