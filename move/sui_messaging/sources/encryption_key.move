module sui_messaging::encryption_key;

public struct EncryptionKey has copy, drop, store {
    encrypted_key_bytes: vector<u8>,
    version: u32,
    state: State,
}

public fun new(encrypted_key_bytes: vector<u8>): EncryptionKey {
    EncryptionKey {
        encrypted_key_bytes,
        version: 0,
        state: State::Enabled,
    }
}

public fun is_enabled(key: &EncryptionKey): bool {
    key.state == State::Enabled
}

public fun is_disabled(key: &EncryptionKey): bool {
    key.state == State::Disabled
}

public(package) fun rotate(key: &mut EncryptionKey, new_encrypted_key_bytes: vector<u8>) {
    key.encrypted_key_bytes = new_encrypted_key_bytes;
    key.version = key.version + 1;
}

public(package) fun enable(key: &mut EncryptionKey) {
    key.state = State::Enabled
}

public(package) fun disable(key: &mut EncryptionKey) {
    key.state = State::Disabled
}

public enum State has copy, drop, store {
    Enabled,
    Disabled,
}

public fun create_enabled_state(): State {
    State::Enabled
}

public fun create_disabled_state(): State {
    State::Disabled
}
