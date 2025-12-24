## Table of Contents

- [Home](./README.md)
- [Installation Guide](./Installation.md)
- [Developer Setup](./Setup.md)
- [SDK API Reference](./APIRef.md)
- [Integration Testing](./Testing.md)

# Example patterns

## In-app product support

This example shows how the builder or operator of a DeFi protocol, a game, or another kind of app can provide direct, encrypted support to their top users. It assumes that each user gets a private 1:1 channel to interact with a support team. The support can be provided by a human operator or by an AI chatbot integrated programmatically.

### 1. Setup the client in the support app

The app initiates a messaging client, extended with Seal and the Messaging SDK. It utilizes the provided Walrus publisher and aggregator for handling attachments.

```typescript
import { SuiClient } from "@mysten/sui/client";
import { SealClient } from "@mysten/seal";
import { messaging } from "@mysten/messaging";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const supportSigner = Ed25519Keypair.generate(); // Support handle/team account

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
    messaging({
      walrusStorageConfig: {
        aggregator: "https://aggregator.walrus-testnet.walrus.space",
        publisher: "https://publisher.walrus-testnet.walrus.space",
        epochs: 1,
      },
      sessionKeyConfig: {
        address: supportSigner.toSuiAddress(),
        ttlMin: 30,
        signer: supportSigner,
      },
    })
  );

const messagingClient = client.messaging;
```

### 2. Create a 1:1 support channel for a user

When a user becomes eligible for support, the app creates a dedicated channel between the user and the support team.

```typescript
const topUserAddress = "0xUSER..."; // Replace with the user's Sui address

const { channelId, encryptedKeyBytes } =
  await messagingClient.executeCreateChannelTransaction({
    signer: supportSigner,
    initialMembers: [topUserAddress],
  });

console.log(`Support channel created for user: ${channelId}`);
```

### 3. Fetch the memberCapId and encryptionKey

Both user and support participants need their `memberCapId` (for authorization) and the channel's `encryptionKey` (to encrypt/decrypt messages).

```typescript
// Get support handle's MemberCap for this channel
const supportMemberCap = await messagingClient.getUserMemberCap(
  supportSigner.toSuiAddress(),
  channelId
);
const supportMemberCapId = supportMemberCap.id.id;

// Get the channel object with encryption key info
const channelObjects = await messagingClient.getChannelObjectsByChannelIds({
  channelIds: [channelId],
  userAddress: supportSigner.toSuiAddress(),
});
const channelObj = channelObjects[0];
const channelEncryptionKey = {
  $kind: "Encrypted",
  encryptedBytes: new Uint8Array(channelObj.encryption_key_history.latest),
  version: channelObj.encryption_key_history.latest_version,
};
```

### 4. User sends a support query

From the user's end of the app, the user can open the support channel and send a query message.

First, the user needs to retrieve their `memberCapId` and encryption key:

```typescript
// Get the user's MemberCap for this channel
const userMemberCap = await messagingClient.getUserMemberCap(userAddress, channelId);
const userMemberCapId = userMemberCap.id.id;
// Get the encryption key info for the channel - as showcased above

// Send the support query
const { digest, messageId } = await messagingClient.executeSendMessageTransaction({
  signer: userSigner,
  channelId,
  memberCapId: userMemberCapId,
  message: "I can't claim my reward from yesterday's tournament.",
  encryptedKey: userChannelEncryptionKey,
});

console.log(`User sent query ${messageId} in tx ${digest}`);
```

### 5. Support team reads the user query and replies

On the support side, the team reads new messages from the user and sends a response.

```typescript
// Support fetches recent user messages
const messages = await messagingClient.getChannelMessages({
  channelId,
  userAddress: supportSigner.toSuiAddress(),
  limit: 5,
  direction: "backward",
});

messages.messages.forEach((m) => console.log(`${m.sender}: ${m.text}`));

// Send a reply
await messagingClient.executeSendMessageTransaction({
  signer: supportSigner,
  channelId,
  memberCapId: supportMemberCapId,
  message: "Thanks for reaching out! Can you confirm the reward ID?",
  encryptedKey: channelEncryptionKey,
});
```

The two parties can continue exchanging messages over the channel until the query is resolved.

### 6. Optional: Support as an AI chatbot

You can replace or augment the support team with an AI agent that programmatically reads user messages, generates responses, and sends them back.

```typescript
// Fetch recent user messages (returns paginated response with cursor for subsequent calls)
const messages = await messagingClient.getChannelMessages({
  channelId,
  userAddress: supportSigner.toSuiAddress(),
  limit: 5,
  direction: "backward",
});

for (const msg of messages.messages) {
  const aiResponse = await callAIService(msg.text); // Custom agent workflow
  await messagingClient.executeSendMessageTransaction({
    signer: supportSigner,
    channelId,
    memberCapId: supportMemberCapId,
    message: aiResponse,
    encryptedKey: channelEncryptionKey,
  });
}
```

The AI agent can then engage in the same two-way conversation loop as a human support operator.

## Adding new members to an existing channel

This example shows how a channel creator can add new members to an existing channel. This is useful when you need to expand access to a conversation after the channel has been created.

> [!NOTE]
> Only the channel creator (the account that has the `CreatorCap`) can add new members to a channel.

### 1. Adding members using the simplified method

The easiest way to add members is using `executeAddMembersTransaction`, which handles the entire process in a single call. If you don't provide `creatorCapId`, the SDK will automatically fetch it using the signer's address.

```typescript
// Assume you have already created a channel and have the channelId and creatorMemberCapId
const channelId = "0xCHANNEL...";
const creatorMemberCapId = "0xCREATORMEMBERCAP..."; // Creator's MemberCap ID

// Add two new members to the channel
const newMemberAddresses = [
  "0xNEWMEMBER1...",
  "0xNEWMEMBER2...",
];

// Option 1: Let the SDK auto-fetch the CreatorCap
const { digest, addedMembers } = await messagingClient.executeAddMembersTransaction({
  signer: creatorSigner, // Must be the channel creator
  channelId,
  memberCapId: creatorMemberCapId,
  newMemberAddresses,
});

// Option 2: Provide creatorCapId explicitly (faster if you already have it)
const { digest, addedMembers } = await messagingClient.executeAddMembersTransaction({
  signer: creatorSigner,
  channelId,
  memberCapId: creatorMemberCapId,
  creatorCapId: "0xCREATORCAP...",
  newMemberAddresses,
});

console.log(`Added ${addedMembers.length} new members in tx ${digest}`);
addedMembers.forEach(({ memberCap, ownerAddress }) => {
  console.log(`Member ${ownerAddress} received MemberCap ${memberCap.id.id}`);
});
```

### 2. Adding members with transaction builder pattern

For more control over transaction composition, use the transaction builder pattern:

```typescript
import { Transaction } from "@mysten/sui/transactions";

const tx = new Transaction();

// Build the add members transaction (can use address instead of creatorCapId)
const addMembersBuilder = messagingClient.addMembers({
  channelId,
  memberCapId: creatorMemberCapId,
  newMemberAddresses,
  address: creatorSigner.toSuiAddress(), // Auto-fetches CreatorCap
});

// Add to the transaction
await addMembersBuilder(tx);

// Sign and execute
const result = await creatorSigner.signAndExecuteTransaction({
  transaction: tx,
});

console.log(`Transaction digest: ${result.digest}`);
```

### 3. Adding members using direct transaction method

You can also use `addMembersTransaction` which returns a `Promise<Transaction>` directly:

```typescript
const tx = await messagingClient.addMembersTransaction({
  channelId,
  memberCapId: creatorMemberCapId,
  newMemberAddresses,
  address: creatorSigner.toSuiAddress(), // Auto-fetches CreatorCap
});

const result = await creatorSigner.signAndExecuteTransaction({
  transaction: tx,
});
```

### 4. Verifying the new members were added

After adding members, you can verify they were successfully added by fetching the channel members:

```typescript
const channelMembers = await messagingClient.getChannelMembers(channelId);

console.log(`Total members: ${channelMembers.members.length}`);
channelMembers.members.forEach((member) => {
  console.log(`Member: ${member.memberAddress}`);
  console.log(`MemberCapId: ${member.memberCapId}`);
});
```

### Example: Expanding a support team

Building on the in-app product support example, you might want to add additional support agents to a channel:

```typescript
// Original support channel with one user
const { channelId } = await messagingClient.executeCreateChannelTransaction({
  signer: supportSigner,
  initialMembers: [topUserAddress],
});

// Get the creator's MemberCap using the new getUserMemberCap method
const creatorMemberCap = await messagingClient.getUserMemberCap(
  supportSigner.toSuiAddress(),
  channelId
);
const supportMemberCapId = creatorMemberCap.id.id;

// Later, add more support agents to help with the conversation
const additionalAgents = [
  "0xSUPPORT_AGENT_2...",
  "0xSUPPORT_AGENT_3...",
];

// CreatorCap is auto-fetched using signer's address
await messagingClient.executeAddMembersTransaction({
  signer: supportSigner,
  channelId,
  memberCapId: supportMemberCapId,
  newMemberAddresses: additionalAgents,
});

console.log("Support team expanded successfully");
```

## Cross-App Identity & Reputation Updates

This example shows how an identity app (e.g., proof-of-humanity or reputation scoring) can publish updates about a user’s status. Multiple consuming apps, such as DeFi protocols, games, or social platforms, subscribe to those updates via secure messaging channels.

This pattern emulates a Pub/Sub workflow, but by using on-chain & decentralized storage, verifiable identities, and Seal encryption.

### 1. Setup the client (Identity App Publisher)

```typescript
import { SuiClient } from "@mysten/sui/client";
import { SealClient } from "@mysten/seal";
import { messaging } from "@mysten/messaging";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const publisherSigner = Ed25519Keypair.generate(); // Identity app's account

const client = new SuiClient({ url: "https://fullnode.testnet.sui.io:443" })
  .$extend(SealClient.asClientExtension({ serverConfigs: [] }))
  .$extend(
    messaging({
      walrusStorageConfig: {
        aggregator: "https://aggregator.walrus-testnet.walrus.space",
        publisher: "https://publisher.walrus-testnet.walrus.space",
      },
      sessionKeyConfig: {
        address: publisherSigner.toSuiAddress(),
        ttlMin: 30,
        signer: publisherSigner,
      },
    })
  );

const messagingClient = client.messaging;
```

### 2. Create a `Reputation Updates` channel

The identity app creates a dedicated channel for reputation updates. All participants, including the user and subscribing apps, must be added during channel creation.

```typescript
const userAddress = "0xUSER..."; // User being tracked
const defiAppAddress = "0xDEFI..."; // DeFi protocol
const gameAppAddress = "0xGAME..."; // Gaming app
const socialAppAddress = "0xSOCIAL..."; // Social app

const { channelId } = await messagingClient.executeCreateChannelTransaction({
  signer: publisherSigner,
  initialMembers: [
    userAddress,
    defiAppAddress,
    gameAppAddress,
    socialAppAddress,
  ],
});

console.log(`Created reputation updates channel: ${channelId}`);
```

> [!NOTE]
> If you need to add more subscribers later, you can use the `addMembers` functionality (see the "Adding new members to an existing channel" example above). Only the channel creator can add new members.

### 3. Publish an identity/reputation update

Whenever the user’s reputation score changes, the identity app publishes an update to the channel.

```typescript
await messagingClient.executeSendMessageTransaction({
  signer: publisherSigner,
  channelId,
  memberCapId: publisherMemberCapId, // Publisher’s MemberCap for this channel
  message: JSON.stringify({
    type: "reputation_update",
    user: userAddress,
    newScore: 82,
    timestamp: Date.now(),
  }),
  encryptedKey: channelEncryptionKey, // Channel encryption key
});

console.log("Published reputation update to channel");
```

### 4. Consuming apps subscribe to updates

Each subscriber app (e.g., DeFi, game, social) sets up its own client and checks the channel for updates.

```typescript
// Example: DeFi app consuming updates (returns paginated response with cursor for subsequent calls)
const messages = await messagingClient.getChannelMessages({
  channelId,
  userAddress: defiAppAddress,
  limit: 5,
  direction: "backward",
});

for (const msg of messages.messages) {
  const update = JSON.parse(msg.text);
  if (update.type === "reputation_update") {
    console.log(`⚡ User ${update.user} → new score ${update.newScore}`);
    // Adapt permissions accordingly
    await adaptDeFiPermissions(update.user, update.newScore);
  }
}
```

The same logic applies for the gaming or social apps, where each app consumes messages and adapts its logic (e.g., unlocking tournaments, adjusting access tiers, enabling new social badges).

### Benefits of this pattern

- Asynchronous propagation: Updates flow automatically to all apps; users don’t need to resync credentials.
- Verifiable identity: Updates are tied to the publisher’s Sui account. No spoofing.
- Privacy-preserving: Seal encrypts all updates; only channel members can read them.
- Composable: Works like a Web3-native event bus, similar to Kafka or Pub/Sub, but with on-chain guarantees.

[Back to table of contents](#table-of-contents)
