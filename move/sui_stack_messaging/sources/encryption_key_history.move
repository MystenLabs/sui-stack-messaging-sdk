module sui_stack_messaging::encryption_key_history;

use sui::table_vec::{Self, TableVec};
use sui_stack_messaging::auth::Auth;

const MAX_KEY_BYTES: u64 = 512;
const EEncryptionKeyBytesTooLong: u64 = 0;
const ENotPermitted: u64 = 1;

public struct EditEncryptionKey() has drop;

/// The History of encryption keys of a Channel.
public struct EncryptionKeyHistory has store {
    latest: vector<u8>,
    latest_version: u32,
    history: TableVec<vector<u8>>,
}

public(package) fun empty(ctx: &mut TxContext): EncryptionKeyHistory {
    EncryptionKeyHistory {
        latest: vector::empty<u8>(),
        latest_version: 0,
        history: table_vec::empty(ctx),
    }
}

/// Get the latest encryption key version, where the first version is the number 1.
public(package) fun latest_key_version(self: &EncryptionKeyHistory): u32 {
    self.latest_version
}

/// Get the latest encryption key
public(package) fun latest_key(self: &EncryptionKeyHistory): vector<u8> {
    self.latest
}

/// Check if an encryption key has been attached
public(package) fun has_encryption_key(self: &EncryptionKeyHistory): bool {
    self.latest_version > 0 && !self.latest.is_empty()
}

/// A Channel's encryption key is supposed to be rotated
/// either manually(e.g. on an interval of 12 months) OR
/// when a member is kicked off/leaves from the Channel.
///
/// In this case, we need to push the existing `latest`
/// to the history, increment the `latest_version` by 1,
///  and insert the new key in the `latest` field.
///
/// On each message, we keep track of the version of the key
/// that was used to encrypt it. That way, we can query the
/// encryption key history, in order to decrypt older messages.
public(package) fun rotate_key(
    self: &mut EncryptionKeyHistory,
    auth: &Auth,
    member_cap_id: ID,
    new_encryption_key_bytes: vector<u8>,
) {
    assert!(auth.has_permission<EditEncryptionKey>(member_cap_id), ENotPermitted);
    assert!(new_encryption_key_bytes.length() <= MAX_KEY_BYTES, EEncryptionKeyBytesTooLong);
    if (self.has_encryption_key()) {
        let existing_key = self.latest;
        self.history.push_back(existing_key);
    };
    self.latest_version = self.latest_version + 1;
    self.latest = new_encryption_key_bytes;
}
