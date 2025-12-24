---
'@mysten/messaging': minor
---

Add `getUserMemberCap()` and `getCreatorCap()` methods for fetching user capabilities by channel

- `getUserMemberCap(userAddress, channelId)`: Returns user's MemberCap for a specific channel
- `getCreatorCap(userAddress, channelId)`: Returns user's CreatorCap for a specific channel
- `addMembers` methods now auto-fetch CreatorCap when `address` is provided instead of `creatorCapId`
- Both methods handle pagination internally, simplifying common lookup patterns
