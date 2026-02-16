# Mainnet Deployment Note (2026-02-16)

Executed on mainnet successfully with address `0x3db42086e9271787046859d60af7933fa7ea70148df37c9fd693195533eabb57`.

- Active address: `0x3db42086e9271787046859d60af7933fa7ea70148df37c9fd693195533eabb57`
- Tx digest: `E551CSSGWQsXChSCFQPR7BNMWWQv7TB7KYV2iyZkxVyz`
- Status: `Success`
- New upgraded package ID: `0x74e34e2e4a2ba60d935db245c0ed93070bbbe23bf1558ae5c6a2a8590c8ad470`
- Upgrade cap (same object, new version): `0x1829ea7b90624dc019fd4df90e58bc092da03117f11ff585af958f0fb074d324`
- SUI spent: `78,506,620` mist (`0.07850662 SUI`)

Local metadata was updated at:

- `move/sui_stack_messaging/Published.toml:7`
- `move/sui_stack_messaging/Published.toml:9`

To use this package in apps, pass the package ID explicitly:

```ts
const client = new SuiStackMessagingClient({
  suiClient,
  storage,
  packageConfig: {
    packageId: "0x74e34e2e4a2ba60d935db245c0ed93070bbbe23bf1558ae5c6a2a8590c8ad470",
  },
  // sessionKey/sessionKeyConfig + seal config...
});
```

Note: repo default constants still point to an older fallback ID in `packages/messaging/src/constants.ts:6`.

## DevOps

CDN manifest for this deployment is committed at `cdn/messaging-mainnet.json`.

- Git tag: `mainnet-messaging-v2-2026-02-16`
- Manifest commit: `e7280c8`
- jsDelivr URL: `https://cdn.jsdelivr.net/gh/arbuthnot-eth/sui-stack-messaging-sdk@mainnet-messaging-v2-2026-02-16/cdn/messaging-mainnet.json`
- Raw GitHub URL: `https://raw.githubusercontent.com/arbuthnot-eth/sui-stack-messaging-sdk/mainnet-messaging-v2-2026-02-16/cdn/messaging-mainnet.json`

Recommended consumption pattern:

1. Fetch manifest from jsDelivr.
2. Read `packageId`.
3. Inject into SDK `packageConfig.packageId` at runtime.
