## Table of Contents

- [Home - Overview and Installation](./README.md)
- [Developer Setup](./Setup.md)
- [Integration Testing](./Testing.md)
- Example App - TBD

# SDK APIs

## Channels

- **`getChannelMemberships(request)`** - Get channel memberships for a user with pagination support. Returns a list of channels the user is a member of along with their member cap IDs.

- **`getChannelObjectsByAddress(request)`** - Get channel objects for a user by fetching their memberships first, then retrieving the full channel objects. This is a convenience method that combines membership lookup with channel object fetching.

- **`getChannelObjectsByChannelIds(channelIds)`** - Get channel objects by their IDs. Useful when you already know the channel IDs and need the full channel metadata.

- **`getChannelMembers(channelId)`** - Get all members of a specific channel, including their addresses and member cap IDs. This method queries the channel's permission structure to find all current members.

- **`createChannelFlow(opts)`** - Create a channel creation flow with step-by-step methods. This provides fine-grained control over the channel creation process, allowing you to build, execute, and manage the transaction in stages. CAVEAT: requires 2 separate transactions.

- **`executeCreateChannelTransaction(params)`** - Execute a complete channel creation transaction in one call. This is a convenience method that handles the entire flow internally.

## Messages

- **`sendMessage(...)`** - Create a send message transaction builder function. Returns a function that can be used to build a transaction for sending encrypted messages with optional attachments.

- **`executeSendMessageTransaction(params)`** - Execute a complete send message transaction. This method handles message encryption, attachment processing, and transaction execution.

- **`getChannelMessages(request)`** - Get messages from a channel with pagination support. Supports both forward and backward pagination with configurable limits and cursors.

- **`getLatestMessages(request)`** - Get new messages since the last polling state. This is optimized for real-time messaging applications that need to check for new messages efficiently.

- **`decryptMessage(message, channelId, memberCapId, encryptedKey)`** - Decrypt a message using the provided encryption key. Returns the decrypted text and lazy-loaded attachments that can be downloaded on-demand.

[Back to table of contents](#table-of-contents)