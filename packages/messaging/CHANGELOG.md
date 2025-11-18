# @mysten/messaging

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
