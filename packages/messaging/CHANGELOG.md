# @mysten/messaging

## 0.3.0

### Minor Changes

- 0eb82e3: Add `getUserMemberCap()` and `getCreatorCap()` methods for fetching user capabilities by channel
  - `getUserMemberCap(userAddress, channelId)`: Returns user's MemberCap for a specific channel
  - `getCreatorCap(userAddress, channelId)`: Returns user's CreatorCap for a specific channel
  - `addMembers` methods now auto-fetch CreatorCap when `address` is provided instead of `creatorCapId`
  - Both methods handle pagination internally, simplifying common lookup patterns

## 0.2.0

### Minor Changes

- 2fd6844: Add standalone `messaging()` function as the recommended way to create client extensions.
  The `SuiStackMessagingClient.experimental_asClientExtension()` static method is now soft-deprecated.

### Patch Changes

- b5866a4: Add optional LogTape structured logging support

  The Messaging SDK now includes structured logging using LogTape.
  This is completely optional - install and configure LogTape in your application to enable logging.

  For setup and configuration, see [logging.md](./logging.md).

- 0bb45fe: Updated dependencies
  - @mysten/bcs@1.9.2
  - @mysten/seal@0.9.6
  - @mysten/sui@1.45.2
  - @mysten/walrus@0.8.6

## 0.1.0

### Minor Changes

- bfeb536: Introduce the `addMembers` API to enable channel creators to add members to existing channels

  Expose three new methods following the SDK pattern:
  - addMembers(): Transaction builder
  - addMembersTransaction(): Returns Transaction object
  - executeAddMembersTransaction(): Execute and return results with member details

## 0.0.3

### Patch Changes

- 62a92e5: Update dependencies
- 695b2bd: fix: deduplicate channel members when creating a new channel. fix: an issue with getChannelObjectsByAddress when a user address had duplicate memberships for the same channel.

## 0.0.2

### Patch Changes

- Add README.md to npm package

## 0.0.1

### Patch Changes

- Initial release
