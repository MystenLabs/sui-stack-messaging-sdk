# Installation

> [!NOTE]
> The SDK is not yet published to npm. Until that's available, follow the manual installation steps below.

## Option 1: Install using tarball (Recommended)

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

3. **Import and use:**

```typescript
import { SuiStackMessagingClient } from "@mysten/messaging";
```

## Option 2: Copy Package Directly

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

## Smart Contract Deployment

The SDK requires a Move smart contract to manage channels, messages, and membership. The contract source code is available at [`move/sui_stack_messaging/`](./move/sui_stack_messaging/). Clone it, modify & adapt it to the needs of your app, and publish to Sui.

**Deploy the contract:**

```bash
cd move/sui_stack_messaging
sui move build
sui client publish --gas-budget 100000000
```

**Configure the SDK with your deployed package ID:**

```typescript
import { SuiStackMessagingClient } from "@mysten/messaging";

const client = suiClient.$extend(
  SuiStackMessagingClient.experimental_asClientExtension({
    packageConfig: {
      packageId: "0x<your-deployed-package-id>",
    },
    // ... other config
  })
);
```