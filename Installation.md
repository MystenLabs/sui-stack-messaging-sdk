## Table of Contents

- [Home](./README.md)
- [Developer Setup](./Setup.md)
- [SDK API Reference](./APIRef.md)
- [Integration Testing](./Testing.md)
- [Example patterns](./Examples.md)

# Installation

## Option 1: Install from npm (Recommended)

```bash
pnpm add @mysten/messaging
# or
npm install @mysten/messaging
# or
yarn add @mysten/messaging
```

Then import and use:

```typescript
import { SuiStackMessagingClient } from "@mysten/messaging";
```

## Option 2: Build and install locally

1. **Clone and build the SDK:**

```bash
git clone https://github.com/MystenLabs/sui-stack-messaging-sdk.git
cd sui-stack-messaging-sdk/packages/messaging
pnpm install
pnpm build
pnpm pack
```

This generates a tarball file: `mysten-messaging-<version>.tgz`

2. **Install in your project:**

```bash
# From the SDK directory (sui-stack-messaging-sdk/packages/messaging)
# Copy the tarball to your project and install with full path
cp mysten-messaging-<version>.tgz /path/to/your/project/
cd /path/to/your/project
pnpm add $(pwd)/mysten-messaging-<version>.tgz
```

## Option 3: Copy package contents directly

Use this option if you would like to modify the SDK or integrate it directly into your monorepo:

```bash
# Clone the repository
git clone https://github.com/MystenLabs/sui-stack-messaging-sdk.git

# Copy the messaging package to your project
cp -r sui-stack-messaging-sdk/packages/messaging /path/to/your/project/packages/

# Install dependencies and build
cd /path/to/your/project/packages/messaging
pnpm install
pnpm build
```

Then configure your project's `package.json` to reference the local package:

```json
{
  "dependencies": {
    "@mysten/messaging": "workspace:*"
  }
}
```

## Requirements

- Node.js >=18
- pnpm >=10.17.0

Check out instructions for [Developer Setup](./Setup.md).

## Smart contract deployment

The SDK requires a Move smart contract to manage channels, messages, and membership. You may use the contract available on `Testnet` - `0x984960ebddd75c15c6d38355ac462621db0ffc7d6647214c802cd3b685e1af3d`, or deploy your own. If latter, refer to the sample contract source code at [`move/sui_stack_messaging/`](./move/sui_stack_messaging/) - clone it, modify & adapt it to the needs of your app, and publish to Sui.

**Deploy the contract:**

```bash
cd move/sui_stack_messaging
sui move build
sui client publish --gas-budget 100000000
```

Also refer to [Smart contract configuration in the SDK](./Setup.md#smart-contract-configuration).

[Back to table of contents](#table-of-contents)
