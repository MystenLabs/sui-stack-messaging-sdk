## Table of Contents

- [Home - Overview and Installation](./README.md)
- [Developer Setup](./Setup.md)
- [Integration Testing](./Testing.md)
- [Example patterns](./Examples.md)

# SDK API Reference

## Channel Management

### `getChannelMemberships(request: ChannelMembershipsRequest): Promise<ChannelMembershipsResponse>`

Returns the list of channels a user belongs to, with pagination support.

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

### `getChannelObjectsByAddress(request: ChannelMembershipsRequest): Promise<DecryptedChannelObjectsByAddressResponse>`

Retrieves decrypted channel objects for a user's memberships.

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

**Note:** This method first fetches memberships, then retrieves and decrypts the corresponding channel objects including the last message.

---

### `getChannelObjectsByChannelIds(request: GetChannelObjectsByChannelIdsRequest): Promise<DecryptedChannelObject[]>`

Retrieves decrypted channel objects by channel IDs.

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

### `getChannelMembers(channelId: string): Promise<ChannelMembersResponse>`

Returns all members of a specific channel.

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

### `createChannelFlow(opts: CreateChannelFlowOpts): CreateChannelFlow`

Creates a channel using a multi-step flow for fine-grained control.

**Parameters:**

```typescript
{
  creatorAddress: string;
  initialMemberAddresses?: string[];
}
```

**Returns:** A flow object with the following methods:

1. **`build(): Transaction`** - Build the channel creation transaction
2. **`getGeneratedCaps(opts: { digest: string }): Promise<{ creatorCap, creatorMemberCap, additionalMemberCaps }>`** - Extract capabilities from transaction
3. **`generateAndAttachEncryptionKey(): Promise<Transaction>`** - Generate and attach encryption key transaction
4. **`getGeneratedEncryptionKey(): { channelId: string; encryptedKeyBytes: Uint8Array }`** - Get the generated encryption key

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

**Note:** This flow requires two separate transactions. We plan on improving this in the near future.

---

### `executeCreateChannelTransaction(params): Promise<{ digest, channelId, creatorCapId, encryptedKeyBytes }>`

Creates a channel in a single call, managing the entire flow internally.

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

## Message Management

### `getChannelMessages(request: GetChannelMessagesRequest): Promise<DecryptedMessagesResponse>`

Retrieves decrypted messages from a channel with pagination support.

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

### `getLatestMessages(request: GetLatestMessagesRequest): Promise<DecryptedMessagesResponse>`

Returns new decrypted messages since the last polling state.

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

### `sendMessage(channelId, memberCapId, sender, message, encryptedKey, attachments?): Promise<(tx: Transaction) => Promise<void>>`

Builds a transaction for sending an encrypted message with optional attachments.

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

### `executeSendMessageTransaction(params): Promise<{ digest: string; messageId: string }>`

Sends a message in a single call.

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

## Session Key Management

### `updateSessionKey(newSessionKey: SessionKey): void`

Updates the external SessionKey instance.

**Parameters:**

- `newSessionKey` - The new SessionKey to use

**Note:** Only works when the client was configured with an external SessionKey.

---

### `refreshSessionKey(): Promise<SessionKey>`

Force refreshes the managed SessionKey.

**Parameters:** None

**Returns:** The refreshed SessionKey

**Note:** Only works when the client was configured with SessionKeyConfig.

---

## Type Definitions

### `DecryptedMessage`

```typescript
{
  text: string;
  sender: string;
  createdAtMs: string;
  attachments?: LazyDecryptAttachmentResult[];
}
```

### `LazyDecryptAttachmentResult`

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

**Note:** The attachment's data, is returned as a prepared Promise, which you can lazily await, to download and decrypt the data. That way, you can e.g., immediately show the message's text, and the attachment's metadata, without having to wait for the data to be downloaded and decrypted.

### `DecryptedChannelObject`

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

### `EncryptedSymmetricKey`

```typescript
{
  $kind: "Encrypted";
  encryptedBytes: Uint8Array;
  version: number;
}
```

---

[Back to table of contents](#table-of-contents)
