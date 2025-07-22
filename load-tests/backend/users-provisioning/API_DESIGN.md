# Sui Messaging API Design

## Overview

This document describes the API design for efficient polling and channel object fetching in the Sui Messaging system. The design focuses on minimizing round trips and providing optimal performance for real-time messaging applications.

## API Endpoints

### Channel Management

#### 1. Create Channel

```
POST /contract/channel
```

Creates a new channel with default settings.

**Request Body:**

```json
{
  "secret_key": "string",
  "channel_name": "string",
  "initial_members": ["address1", "address2"]
}
```

#### 2. Fetch Channel Object

```
GET /contract/channel/:channel_id
```

Fetches a complete channel object with all metadata including the messages table ID.

**Response:**

```json
{
  "message": "Channel {channel_id} fetched successfully.",
  "channel": {
    "id": "string",
    "version": "number",
    "rolesTableId": "string",
    "membersTableId": "string",
    "messagesTableId": "string",
    "messagesCount": "number",
    "lastMessage": "Message | null",
    "wrappedKek": "Uint8Array",
    "kekVersion": "number",
    "createdAtMs": "number",
    "updatedAtMs": "number"
  }
}
```

### Channel Memberships

#### 3. Fetch Basic Memberships

```
GET /contract/channel/memberships/:user_address?limit=10
```

Returns basic membership information (memberCapId and channelId).

**Response:**

```json
{
  "message": "Found {count} memberships for user {user_address}.",
  "memberships": [
    {
      "memberCapId": "string",
      "channelId": "string"
    }
  ]
}
```

#### 4. Fetch Memberships with Metadata

```
GET /contract/channel/memberships/:user_address/with-metadata?limit=10
```

Returns memberships with full channel metadata, including the messages table ID for efficient polling.

**Response:**

```json
{
  "message": "Found {count} memberships with metadata for user {user_address}.",
  "memberships": [
    {
      "memberCapId": "string",
      "channelId": "string",
      "channel": {
        "id": "string",
        "version": "number",
        "rolesTableId": "string",
        "membersTableId": "string",
        "messagesTableId": "string",
        "messagesCount": "number",
        "lastMessage": "Message | null",
        "wrappedKek": "Uint8Array",
        "kekVersion": "number",
        "createdAtMs": "number",
        "updatedAtMs": "number"
      }
    }
  ]
}
```

### Message Operations

#### 5. Send Message

```
POST /contract/channel/message
```

Sends a message to a channel.

**Request Body:**

```json
{
  "secret_key": "string",
  "channel_id": "string",
  "member_cap_id": "string",
  "message": "string"
}
```

#### 6. Fetch Messages by Channel ID

```
GET /contract/channel/:channel_id/messages?limit=10
```

Fetches messages for a channel (requires fetching channel object first).

#### 7. Fetch Messages by Table ID (Polling)

```
GET /contract/messages/table/:table_id?limit=10
```

**Efficient polling endpoint** - fetches messages directly from the messages table ID.

## Optimized Polling Strategy

### Recommended Usage Pattern

1. **Initial Load**: Use `/channel/memberships/:user_address/with-metadata` to get channel list with metadata
2. **Channel Selection**: Store the `messagesTableId` from the channel object
3. **Polling**: Use `/messages/table/:table_id` for efficient message polling

### Performance Benefits

- **Reduced Round Trips**: No need to fetch channel object before polling messages
- **Cached Table IDs**: Store messages table IDs locally after initial fetch
- **Efficient Polling**: Direct access to message table without channel object overhead

### Example Client Implementation

```typescript
class MessagingClient {
  private messageTableIds = new Map<string, string>();

  async loadChannelList(userAddress: string) {
    const response = await fetch(
      `/contract/channel/memberships/${userAddress}/with-metadata`
    );
    const { memberships } = await response.json();

    // Cache message table IDs for efficient polling
    memberships.forEach((membership) => {
      this.messageTableIds.set(
        membership.channelId,
        membership.channel.messagesTableId
      );
    });

    return memberships;
  }

  async pollMessages(channelId: string, limit = 10) {
    const tableId = this.messageTableIds.get(channelId);
    if (!tableId) {
      throw new Error(`No cached table ID for channel ${channelId}`);
    }

    const response = await fetch(
      `/contract/messages/table/${tableId}?limit=${limit}`
    );
    return response.json();
  }
}
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:

- `400`: Bad Request (missing required fields)
- `404`: Not Found (channel doesn't exist)
- `500`: Internal Server Error

## Performance Considerations

1. **Batch Operations**: Consider implementing batch message fetching for multiple channels
2. **Caching**: Cache channel objects and table IDs on the client side
3. **Pagination**: Use the `limit` parameter to control response size
4. **Polling Intervals**: Implement exponential backoff for polling to reduce server load

## Security Notes

- All write operations require a valid `secret_key`
- Read operations are public but should be rate-limited
- Consider implementing authentication for production use
