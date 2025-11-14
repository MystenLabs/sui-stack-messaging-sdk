---
'@mysten/messaging': minor
---

Introduce the `addMembers` API to enable channel creators to add members to existing channels

Expose three new methods following the SDK pattern:

- addMembers(): Transaction builder
- addMembersTransaction(): Returns Transaction object
- executeAddMembersTransaction(): Execute and return results with member details
