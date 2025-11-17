# Logging

The Messaging SDK uses [LogTape](https://github.com/dahlia/logtape) for structured logging. Logging is completely optional - the SDK works perfectly without it.

## Overview

LogTape integration follows a library-first design:
- **Zero configuration required** in the SDK
- **Optional peer dependency** - install only if you want logging
- **Full user control** over what gets logged and where
- **Structured logging** with rich context for debugging

## Installation

Install LogTape as a dependency in your application:

```bash
npm install @logtape/logtape
# or
pnpm add @logtape/logtape
# or
yarn add @logtape/logtape
```

**Note**: LogTape is an optional peer dependency. The Messaging SDK works without it.

## Quick Start

Configure LogTape once at application startup:

```typescript
import { configure, getConsoleSink } from "@logtape/logtape";

// Configure LogTape before using the Messaging SDK
await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    // Enable all messaging SDK logs at info level
    {
      category: ["@mysten/messaging"],
      level: "info",
      sinks: ["console"],
    },
  ],
});
```

## Logging Categories

The SDK uses a hierarchical category structure for fine-grained control:

| Category | Description | Typical Operations |
|----------|-------------|-------------------|
| `["@mysten/messaging"]` | Root - captures all SDK logs | All operations |
| `["@mysten/messaging", "client", "reads"]` | Read operations | `getChannelObjects`, `getChannelMessages`, `getChannelMembers` |
| `["@mysten/messaging", "client", "writes"]` | Write operations | `executeCreateChannel`, `executeSendMessage`, `executeAddMembers` |
| `["@mysten/messaging", "encryption"]` | Encryption operations | Key generation, encrypt/decrypt operations |
| `["@mysten/messaging", "storage"]` | All storage operations | Upload/download to storage adapters |
| `["@mysten/messaging", "storage", "walrus"]` | Walrus-specific operations | Walrus uploads, downloads, errors |

## Log Levels

The SDK uses four log levels:

- **`debug`**: Detailed diagnostic information (entry points, parameters)
- **`info`**: Successful operations with key identifiers (channelId, messageId, etc.)
- **`warning`**: Unexpected but handled situations (partial failures, retries)
- **`error`**: Operation failures with error context

## Configuration Examples

### Development: Verbose Logging

Log everything at debug level for maximum visibility:

```typescript
await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    {
      category: ["@mysten/messaging"],
      level: "debug",
      sinks: ["console"],
    },
  ],
});
```

### Production: Errors Only

Log only errors to minimize noise:

```typescript
await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    {
      category: ["@mysten/messaging"],
      level: "error",
      sinks: ["console"],
    },
  ],
});
```

### Selective Logging

Enable debug logging for specific modules:

```typescript
await configure({
  sinks: {
    console: getConsoleSink(),
  },
  loggers: [
    // Info for all SDK operations
    {
      category: ["@mysten/messaging"],
      level: "info",
      sinks: ["console"],
    },
    // Debug for encryption troubleshooting
    {
      category: ["@mysten/messaging", "encryption"],
      level: "debug",
      sinks: ["console"],
    },
    // Debug for storage troubleshooting
    {
      category: ["@mysten/messaging", "storage", "walrus"],
      level: "debug",
      sinks: ["console"],
    },
  ],
});
```

### Multiple Sinks

Send different log levels to different destinations:

```typescript
import { configure, getConsoleSink, getFileSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
    errorFile: getFileSink("errors.log"),
  },
  loggers: [
    // All logs to console
    {
      category: ["@mysten/messaging"],
      level: "info",
      sinks: ["console"],
    },
    // Errors to file
    {
      category: ["@mysten/messaging"],
      level: "error",
      sinks: ["errorFile"],
    },
  ],
});
```

## What Gets Logged

### Read Operations

**Debug level:**
- Entry parameters (channelId, userAddress, cursor, limit)
- Query details

**Info level:**
- Retrieved channelIds
- Message counts and pagination state
- MemberCap IDs

**Example:**
```json
{
  "level": "info",
  "category": ["@mysten/messaging", "client", "reads"],
  "message": "Retrieved channel messages",
  "properties": {
    "channelId": "0x...",
    "messagesTableId": "0x...",
    "messageCount": 10,
    "fetchRange": "0-10",
    "cursor": 10,
    "hasNextPage": true,
    "direction": "backward"
  }
}
```

### Write Operations

**Debug level:**
- Operation parameters (addresses, counts)
- Transaction building details

**Info level:**
- Created object IDs (channelId, messageId, creatorCapId)
- Transaction digests
- Member counts

**Example:**
```json
{
  "level": "info",
  "category": ["@mysten/messaging", "client", "writes"],
  "message": "Channel created",
  "properties": {
    "channelId": "0x...",
    "creatorCapId": "0x...",
    "creatorAddress": "0x...",
    "memberCount": 3,
    "digest": "0x..."
  }
}
```

### Encryption Operations

**Debug level:**
- Key generation events
- Encryption/decryption operations with payload sizes
- No sensitive data (keys or decrypted content)

### Storage Operations

**Debug level:**
- Upload/download initiation with counts and URLs
- Blob IDs and sizes

**Info level:**
- Successful uploads with blob IDs
- Download completion with byte counts

**Error level:**
- Upload failures with HTTP status and error text
- Network errors

## Security Considerations

The SDK **never logs**:
- Raw encryption keys (session keys, symmetric keys, private keys)
- Decrypted message content
- Decrypted attachment data
- Private key material

The SDK **does log**:
- Object IDs (channels, messages, caps) - these are public on-chain
- Payload lengths (not content)
- Public keys
- Operation metadata (counts, timestamps)
- Error messages (from `Error.message` - may contain sensitive info in stack traces)

**Important**: Error messages are logged as-is from exceptions. Review your error logs to ensure no sensitive data is exposed. Consider using LogTape's [redaction features](https://jsr.io/@logtape/logtape/doc/redaction/~) if needed.

## Troubleshooting

### Logs Not Appearing

1. **Verify LogTape is configured**:
   ```typescript
   await configure({ /* ... */ });
   ```
   Call this before using the Messaging SDK.

2. **Check log level**:
   Ensure the category's `level` is low enough to capture logs.
   Example: `"debug"` captures everything, `"error"` only errors.

3. **Verify category matches**:
   Use `["@mysten/messaging"]` to capture all SDK logs.

### Too Many Logs

1. **Increase log level**:
   Change from `"debug"` to `"info"` or `"warning"`.

2. **Add filters**:
   ```typescript
   {
     category: ["@mysten/messaging"],
     level: "info",
     filters: [(record) => record.properties.channelId === "0x..."],
     sinks: ["console"],
   }
   ```

3. **Target specific categories**:
   Only enable logging for modules you're debugging.

## Advanced Usage

For advanced LogTape features such as:
- Request tracing with implicit contexts
- Custom sinks and formatters
- Data redaction
- Integration with monitoring systems
- Performance optimization

Please refer to the [LogTape Documentation](https://jsr.io/@logtape/logtape).

## Further Reading

- [LogTape Documentation](https://jsr.io/@logtape/logtape)
- [LogTape GitHub](https://github.com/dahlia/logtape)
- [Messaging SDK API Documentation](./README.md)
