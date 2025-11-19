# Logging

The Messaging SDK uses [LogTape](https://github.com/dahlia/logtape) for structured logging. Logging is completely optional - the SDK works perfectly without it.

## Installation

If you want logging, install LogTape:

```bash
npm install @logtape/logtape
# or
pnpm add @logtape/logtape
# or
yarn add @logtape/logtape
```

## Quick Start

Configure LogTape once at application startup:

```typescript
import { configure, getConsoleSink } from "@logtape/logtape";
import { LOG_CATEGORIES } from "@mysten/messaging";

// Configure LogTape before using the Messaging SDK
await configure({
  sinks: {
    console: getConsoleSink(),
  },
  filters: {},
  loggers: [
    // Enable all messaging SDK logs at info level
    {
      category: LOG_CATEGORIES.ROOT,
      lowestLevel: "info",
      sinks: ["console"],
    },
  ],
});
```

**Tips**:
- **Use `LOG_CATEGORIES` constants**: Import and use the `LOG_CATEGORIES` constants instead of manually writing category arrays (e.g., `["@mysten/messaging"]`). This prevents typos and provides better IDE autocomplete.
- **Production logging**: For production environments, consider using the JSON Lines formatter for machine-readable structured logs:
  ```typescript
  import { getConsoleSink, getJsonLinesFormatter } from "@logtape/logtape";

  const console = getConsoleSink({ formatter: getJsonLinesFormatter() });
  ```
  This outputs one JSON object per line, making it easy to integrate with log aggregation systems like ELK, Datadog, or CloudWatch.

## Logging Categories

The SDK uses a hierarchical category structure for fine-grained control:

| Constant | Category | Description | Typical Operations |
|----------|----------|-------------|-------------------|
| `LOG_CATEGORIES.ROOT` | `["@mysten/messaging"]` | Root - captures all SDK logs | All operations |
| `LOG_CATEGORIES.CLIENT_READS` | `["@mysten/messaging", "client", "reads"]` | Read operations | `getChannelObjects`, `getChannelMessages`, `getChannelMembers` |
| `LOG_CATEGORIES.CLIENT_WRITES` | `["@mysten/messaging", "client", "writes"]` | Write operations | `executeCreateChannel`, `executeSendMessage`, `executeAddMembers` |
| `LOG_CATEGORIES.ENCRYPTION` | `["@mysten/messaging", "encryption"]` | Encryption operations | Key generation, encrypt/decrypt operations |
| `LOG_CATEGORIES.STORAGE` | `["@mysten/messaging", "storage"]` | All storage operations | Upload/download to storage adapters |
| `LOG_CATEGORIES.STORAGE_WALRUS` | `["@mysten/messaging", "storage", "walrus"]` | Walrus-specific operations | Walrus uploads, downloads, errors |

**Recommended**: Use the `LOG_CATEGORIES` constants (imported from `"@mysten/messaging"`) in your configuration for type safety and autocompletion.

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
import { LOG_CATEGORIES } from "@mysten/messaging";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  filters: {},
  loggers: [
    {
      category: LOG_CATEGORIES.ROOT,
      lowestLevel: "debug",
      sinks: ["console"],
    },
  ],
});
```

### Production: Errors Only

Log only errors to minimize noise:

```typescript
import { LOG_CATEGORIES } from "@mysten/messaging";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  filters: {},
  loggers: [
    {
      category: LOG_CATEGORIES.ROOT,
      lowestLevel: "error",
      sinks: ["console"],
    },
  ],
});
```

### Selective Logging

Enable debug logging for specific modules:

```typescript
import { LOG_CATEGORIES } from "@mysten/messaging";

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  filters: {},
  loggers: [
    // Info for all SDK operations
    {
      category: LOG_CATEGORIES.ROOT,
      lowestLevel: "info",
      sinks: ["console"],
    },
    // Debug for encryption troubleshooting
    {
      category: LOG_CATEGORIES.ENCRYPTION,
      lowestLevel: "debug",
      sinks: ["console"],
    },
    // Debug for storage troubleshooting
    {
      category: LOG_CATEGORIES.STORAGE_WALRUS,
      lowestLevel: "debug",
      sinks: ["console"],
    },
  ],
});
```

### Multiple Sinks

Send different log levels to different destinations:

```typescript
import { configure, getConsoleSink, getFileSink } from "@logtape/logtape";
import { LOG_CATEGORIES } from "@mysten/messaging";

await configure({
  sinks: {
    console: getConsoleSink(),
    errorFile: getFileSink("errors.log"),
  },
  filters: {},
  loggers: [
    // All logs to console
    {
      category: LOG_CATEGORIES.ROOT,
      lowestLevel: "info",
      sinks: ["console"],
    },
    // Errors to file
    {
      category: LOG_CATEGORIES.ROOT,
      lowestLevel: "error",
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
- **Object IDs** (channels, messages, member caps) - these are public on-chain
- **Sender and member addresses** - these are public on-chain
- **Payload lengths** (not the actual content)
- **Operation metadata** (counts, timestamps, blob IDs)
- **Error messages** (from `Error.message`) - may contain sensitive information in stack traces

**Important**: Error messages are logged as-is from caught exceptions. Review your error logs to ensure no sensitive data is inadvertently exposed through error messages. Consider using LogTape's [redaction features](https://www.npmjs.com/package/@logtape/logtape) if you need to sanitize logs before sending to external systems.

## Troubleshooting

### Logs Not Appearing

1. **Verify LogTape is configured**:
   ```typescript
   await configure({ /* ... */ });
   ```
   Call this before using the Messaging SDK.

2. **Check log level**:
   Ensure the category's `lowestLevel` is low enough to capture logs.
   Example: `"debug"` captures everything, `"error"` only errors.

3. **Verify category matches**:
   Use `LOG_CATEGORIES.ROOT` (or `["@mysten/messaging"]`) to capture all SDK logs.

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

Please refer to the [LogTape Documentation](https://www.npmjs.com/package/@logtape/logtape).

## Further Reading

- [LogTape Documentation](https://www.npmjs.com/package/@logtape/logtape)
- [LogTape GitHub](https://github.com/dahlia/logtape)
- [Messaging SDK API Documentation](./README.md)
