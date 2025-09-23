## Table of Contents

- [Home - Overview and Installation](./README.md)
- [Developer Setup](./Setup.md)
- [Integration Testing](./Testing.md)
- [Example patterns](./Examples.md)

# SDK APIs

## Channels

- `getChannelMemberships(request)` - Returns the list of channels a user belongs to, with pagination support. Each entry includes the user’s member cap IDs.

- `getChannelObjectsByAddress(request)` - Retrieves full channel objects for a user. This method first fetches the user’s memberships, then retrieves the corresponding channel objects.

- `getChannelObjectsByChannelIds(channelIds)` - Retrieves full channel metadata for a list of known channel IDs. Use this when you already have the IDs and want detailed channel information.

- `getChannelMembers(channelId)` - Returns all members of a specific channel, including their addresses and member cap IDs. This method queries the channel’s permission structure.

- `createChannelFlow(opts)` - Creates a channel using a multi-step flow. This gives you fine-grained control over building, executing, and managing the channel creation process. `Note` that this flow required two separate transactions.

- `executeCreateChannelTransaction(params)` - Creates a channel in a single call. This convenience method manages the entire flow internally.

## Messages

- `sendMessage(...)` - Builds a transaction for sending an encrypted message, with optional attachments. Returns a function that can be used to assemble the transaction.

- `executeSendMessageTransaction(params)` - Sends a message in a single call. This method handles message encryption, attachment processing, and transaction execution.

- `getChannelMessages(request)` - Retrieves messages from a channel with pagination support. Supports forward and backward pagination using limits and cursors.

- `getLatestMessages(request)` - Returns messages created since the last polling state. This method is optimized for real-time apps that check frequently for new messages.

- `decryptMessage(message, channelId, memberCapId, encryptedKey)` - Decrypts a message using the provided key. Returns the decrypted text and lazy-loaded attachments that you can download on demand.

[Back to table of contents](#table-of-contents)