## Table of Contents

- [Home](./README.md)
- [Installation Guide](./Installation.md)
- [Developer Setup](./Setup.md)
- [Integration Testing](./Testing.md)
- [Example patterns](./Examples.md)

# SDK API Reference

## Channel management

### Get channel memberships

**Method:** `getChannelMemberships(request: ChannelMembershipsRequest): Promise<ChannelMembershipsResponse>`

**Purpose:** Returns the list of channels a user belongs to, with pagination support.

**Parameters:**

- `request.address` - User's Sui address
- `request.cursor?` - Pagination cursor (optional)
- `request.limit?` - Number of results per page (optional)

**Returns:**

```typescript
{
  memberships: {
    member_cap_id: string;
    channel_id: string;
  }
  [];
  hasNextPage: boolean;
  cursor: string | null;
}
```

---

### Get channel objects by address

**Method:** `getChannelObjectsByAddress(request: ChannelMembershipsRequest): Promise<DecryptedChannelObjectsByAddressResponse>`

**Purpose:** Retrieves decrypted channel objects for a user's memberships.

**Parameters:**

- `request.address` - User's Sui address
- `request.cursor?` - Pagination cursor (optional)
- `request.limit?` - Number of results per page (optional)

**Returns:**

```typescript
{
  channelObjects: DecryptedChannelObject[];
  hasNextPage: boolean;
  cursor: string | null;
}
```

> [!NOTE] 
> This method first fetches memberships, then retrieves and decrypts the corresponding channel objects including the last message.

---

### Get channel objects by channel ids

**Method:** `getChannelObjectsByChannelIds(request: GetChannelObjectsByChannelIdsRequest): Promise<DecryptedChannelObject[]>`

**Purpose:** Retrieves decrypted channel objects by channel IDs.

**Parameters:**

```typescript
{
  channelIds: string[];
  userAddress: string;
  memberCapIds?: string[]; // Optional: avoids individual lookups if provided
}
```

**Returns:**

```typescript
DecryptedChannelObject[]
```

---

### Get channel members

**Method:** `getChannelMembers(channelId: string): Promise<ChannelMembersResponse>`

**Purpose:** Returns all members of a specific channel.

**Parameters:**

- `channelId` - The channel ID

**Returns:**

```typescript
{
  members: {
    memberAddress: string;
    memberCapId: string;
  }
  [];
}
```

---

### Create channel flow (multi-step flow)

**Method:** `createChannelFlow(opts: CreateChannelFlowOpts): CreateChannelFlow`

**Purpose:** Creates a channel using a multi-step flow for fine-grained control.

**Parameters:**

```typescript
{
  creatorAddress: string;
  initialMemberAddresses?: string[];
}
```

**Returns:** A flow object with the following methods:

1. `build(): Transaction` - Build the channel creation transaction
2. `getGeneratedCaps(opts: { digest: string }): Promise<{ creatorCap, creatorMemberCap, additionalMemberCaps }>` - Extract capabilities from transaction
3. `generateAndAttachEncryptionKey(): Promise<Transaction>` - Generate and attach encryption key transaction
4. `getGeneratedEncryptionKey(): { channelId: string; encryptedKeyBytes: Uint8Array }` - Get the generated encryption key

**Example:**

```typescript
const flow = client.messaging.createChannelFlow({
  creatorAddress: "0x...",
  initialMemberAddresses: ["0xabc...", "0xdef..."],
});

// Step 1: Build and execute channel creation
const tx = flow.build();
const { digest } = await signer.signAndExecuteTransaction({ transaction: tx });

// Step 2: Get generated capabilities
const { creatorCap, creatorMemberCap } = await flow.getGeneratedCaps({
  digest,
});

// Step 3: Generate and attach encryption key
const keyTx = await flow.generateAndAttachEncryptionKey();
await signer.signAndExecuteTransaction({ transaction: keyTx });

// Step 4: Get encryption key
const { channelId, encryptedKeyBytes } = flow.getGeneratedEncryptionKey();
```

> [!NOTE] 
> This flow requires two separate transactions. We plan on improving this in the near future.

---

### Execute create channel transaction

**Method:** `executeCreateChannelTransaction(params): Promise<{ digest, channelId, creatorCapId, encryptedKeyBytes }>`

**Purpose:** Creates a channel in a single call, managing the entire flow internally.

**Parameters:**

```typescript
{
  signer: Signer;
  initialMembers?: string[];
}
```

**Returns:**

```typescript
{
  digest: string;
  channelId: string;
  creatorCapId: string;
  encryptedKeyBytes: Uint8Array;
}
```

---

### Add members to channel

**Method:** `addMembers(options: AddMembersOptions): (tx: Transaction) => Promise<void>`

**Purpose:** Builds a transaction for adding new members to an existing channel. Only the channel creator can add members.

**Parameters:**

```typescript
{
  channelId: string;
  memberCapId: string;        // The creator's MemberCap ID
  newMemberAddresses: string[];
  creatorCapId: string;       // The creator's CreatorCap ID
}
```

**Returns:** A transaction builder function

**Example:**

```typescript
const tx = new Transaction();
const addMembersBuilder = client.messaging.addMembers({
  channelId,
  memberCapId: creatorMemberCapId,  // Creator's MemberCap
  newMemberAddresses: ["0xabc...", "0xdef..."],
  creatorCapId
});

await addMembersBuilder(tx);
await signer.signAndExecuteTransaction({ transaction: tx });
```

> [!NOTE]
> This operation requires both the creator's `MemberCap` and `CreatorCap`.

---

### Add members transaction

**Method:** `addMembersTransaction(options: AddMembersTransactionOptions): Transaction`

**Purpose:** Creates a transaction for adding new members to a channel. Only the channel creator can add members.

**Parameters:**

```typescript
{
  channelId: string;
  memberCapId: string;        // The creator's MemberCap ID
  newMemberAddresses: string[];
  creatorCapId: string;       // The creator's CreatorCap ID
  transaction?: Transaction;  // Optional: provide existing transaction to build on
}
```

**Returns:** A `Transaction` object ready to be signed and executed

**Example:**

```typescript
const tx = client.messaging.addMembersTransaction({
  channelId,
  memberCapId: creatorMemberCapId,  // Creator's MemberCap
  newMemberAddresses: ["0xabc...", "0xdef..."],
  creatorCapId
});

await signer.signAndExecuteTransaction({ transaction: tx });
```

> [!NOTE]
> This operation requires both the creator's `MemberCap` and `CreatorCap`.

---

### Execute add members transaction

**Method:** `executeAddMembersTransaction(params): Promise<{ digest: string; addedMembers: AddedMemberCap[] }>`

**Purpose:** Adds new members to a channel in a single call. Only the channel creator can add members.

**Parameters:**

```typescript
{
  signer: Signer;
  channelId: string;
  memberCapId: string;        // The creator's MemberCap ID
  newMemberAddresses: string[];
  creatorCapId: string;       // The creator's CreatorCap ID
  transaction?: Transaction;  // Optional: provide existing transaction to build on
}
```

**Returns:**

```typescript
{
  digest: string;
  addedMembers: AddedMemberCap[];  // Array of { memberCap, ownerAddress }
}
```

Where `AddedMemberCap` has the structure:
```typescript
{
  memberCap: MemberCap;     // Full MemberCap object
  ownerAddress: string;     // Address of the new member
}
```

**Example:**

```typescript
const { digest, addedMembers } = await client.messaging.executeAddMembersTransaction({
  signer,
  channelId,
  memberCapId: creatorMemberCapId,  // Creator's MemberCap
  newMemberAddresses: ["0xabc...", "0xdef..."],
  creatorCapId
});

console.log(`Added ${addedMembers.length} members`);
addedMembers.forEach(({ memberCap, ownerAddress }) => {
  console.log(`Member ${ownerAddress} received MemberCap ${memberCap.id.id}`);
});
```

> [!NOTE]
> This operation requires both the creator's `MemberCap` and `CreatorCap`.

---

## Message management

### Get channel messages

**Method:** `getChannelMessages(request: GetChannelMessagesRequest): Promise<DecryptedMessagesResponse>`

**Purpose:** Retrieves decrypted messages from a channel with pagination support.

**Parameters:**

```typescript
{
  channelId: string;
  userAddress: string;
  cursor?: bigint | null;     // default: null (starts from latest)
  limit?: number;              // default: 50
  direction?: 'backward' | 'forward';  // default: 'backward'
}
```

**Returns:**

```typescript
{
  messages: DecryptedMessage[];
  cursor: bigint | null;
  hasNextPage: boolean;
  direction: 'backward' | 'forward';
}
```

**Pagination:**

- `backward`: Fetches older messages, starting from the provided cursor(exclusive)
- `forward`: Fetches newer messages, starting from the provided cursor(inclusive)
- `cursor`: Message index to start from (exclusive for backward, inclusive for forward)

---

### Get latest messages

**Method:** `getLatestMessages(request: GetLatestMessagesRequest): Promise<DecryptedMessagesResponse>`

**Purpose:** Returns new decrypted messages since the last polling state.

**Parameters:**

```typescript
{
  channelId: string;
  userAddress: string;
  pollingState: {
    lastMessageCount: bigint;
    lastCursor: bigint | null;
    channelId: string;
  };
  limit?: number;  // default: 50
}
```

**Returns:**

```typescript
{
  messages: DecryptedMessage[];
  cursor: bigint | null;
  hasNextPage: boolean;
  direction: 'backward' | 'forward';
}
```

---

### Send message

**Method:** `sendMessage(channelId, memberCapId, sender, message, encryptedKey, attachments?): Promise<(tx: Transaction) => Promise<void>>`

**Purpose:** Builds a transaction for sending an encrypted message with optional attachments.

**Parameters:**

```typescript
channelId: string;
memberCapId: string;
sender: string;
message: string;
encryptedKey: EncryptedSymmetricKey;
attachments?: File[];
```

**Returns:** A transaction builder function

**Example:**

```typescript
const tx = new Transaction();
const sendMessageBuilder = await client.messaging.sendMessage(
  channelId,
  memberCapId,
  signer.toSuiAddress(),
  "Hello, world!",
  encryptedKey,
  [fileAttachment]
);

await sendMessageBuilder(tx);
await signer.signAndExecuteTransaction({ transaction: tx });
```

---

### Execute send message transaction

**Method:** `executeSendMessageTransaction(params): Promise<{ digest: string; messageId: string }>`

**Purpose:** Sends a message in a single call.

**Parameters:**

```typescript
{
  signer: Signer;
  channelId: string;
  memberCapId: string;
  message: string;
  encryptedKey: EncryptedSymmetricKey;
  attachments?: File[];
}
```

**Returns:**

```typescript
{
  digest: string;
  messageId: string;
}
```

---

## Session key management

### Update session key

**Method:** `updateSessionKey(newSessionKey: SessionKey): void`

**Purpose:** Updates the external `SessionKey` instance.

**Parameters:**

- `newSessionKey` - The new SessionKey to use

> [!NOTE] 
> This method only works when the client is configured with an external `SessionKey`.

---

### Refresh session key

**Method:** `refreshSessionKey(): Promise<SessionKey>`

**Purpose:** Force a refresh of the managed `SessionKey`.

**Parameters:** None

**Returns:** The refreshed `SessionKey`

> [!NOTE] 
> This method only works when the client is configured with `SessionKeyConfig`.

---

## Type definitions

### DecryptedMessage

```typescript
{
  text: string;
  sender: string;
  createdAtMs: string;
  attachments?: LazyDecryptAttachmentResult[];
}
```

### LazyDecryptAttachmentResult

```typescript
{
  // Metadata (available immediately)
  fileName: string;
  mimeType: string;
  fileSize: number;

  // Data (lazy-loaded)
  data: Promise<Uint8Array>;
}
```

> [!NOTE]
> The attachment’s data is returned as a `Promise` that you can await when needed. This allows you to display the message text and attachment metadata immediately, without waiting for the attachment data to download and decrypt.

### DecryptedChannelObject

```typescript
{
  id: { id: string };
  name?: string;
  creator: string;
  members_count: string;
  messages_count: string;
  last_message?: DecryptedMessage | null;
  // ... other channel fields
}
```

### EncryptedSymmetricKey

```typescript
{
  $kind: "Encrypted";
  encryptedBytes: Uint8Array;
  version: number;
}
```

---

[Back to table of contents](#table-of-contents)
