module sui_messaging::encryption_key_history;

use sui::table_vec::{Self, TableVec};

const MAX_KEY_BYTES: u64 = 32;
const EEncryptionKeyBytesTooLong: u64 = 0;

/// The History of encryption keys of a Channel.
///
/// A Channel's encryption key is supposed to be rotated
/// either manually(e.g. on an interval of 12 months) OR
/// when a member is kicked off/leaves from the Channel.
///
/// In this case, the latest key, is the last element.
/// And the version is the length of the TableVec.
///
/// On each message, we keep track of the version of the key
/// that was used to encrypt it. That way, we can query the
/// encryption key history, in order to decrypt older messages.
/// In cases of
public struct EncryptionKeyHistory has store {
    encryption_keys: TableVec<vector<u8>>,
}

public(package) fun empty(ctx: &mut TxContext): EncryptionKeyHistory {
    EncryptionKeyHistory { encryption_keys: table_vec::empty(ctx) }
}

public(package) fun singleton(
    encryption_key_bytes: vector<u8>,
    ctx: &mut TxContext,
): EncryptionKeyHistory {
    // limit the size of the key
    assert!(encryption_key_bytes.length() <= MAX_KEY_BYTES, EEncryptionKeyBytesTooLong);
    EncryptionKeyHistory { encryption_keys: table_vec::singleton(encryption_key_bytes, ctx) }
}

/// Get the latest encryption key version, where the first version is the number 1.
public(package) fun latest_encryption_key_version(self: &EncryptionKeyHistory): u64 {
    self.encryption_keys.length()
}
