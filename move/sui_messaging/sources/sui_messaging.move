module sui_messaging::sui_messaging;

// === Imports ===

// === Errors ===
const ENotMember: u64 = 1;

// === Constants ===
const MAX_CHANNEL_MEMBERS = 1000;
const MAX_CHANNEL_ADMINS = 100;

// === Enums ===
public enum ChannelVariant {
    OneToOne,
    Group
}

// === Capabilities ===

/// Cap for package-level administration
public struct AdminCap has key {
    id: UID
}

public struct ChannelAdminCap has key {
    id: UID,
    channel_id: ID,
    permissions: AdminPermissions
}

public struct AdminPermissions has store {
    can_add: bool,
    can_remove: bool,
    can_promote: bool,
    can_demote: bool,
    can_update_metadata: bool,
    can_update_policies: bool
}

// === Core Objects ===

/// Shared Channel object, tracking a chat group.
public struct Channel has key {
    id: UID,
    name: String,
    metadata: Table<String, String>, // ??? maybe use a generic instead?
    variant: ChannelVariant,
    is_public: bool, // if true, anyone can join without requesting approval from an admin
    creator: address,
    members: vector<address>, // enforce a max on the package-level, but allow the configuration of lower number
    admins: vector<address>, // Maybe keep some sort of AdminInfo objects, instead of plain addresses | again, enforce max number
    messages: Table<u64, ID> // or ObjectTable ??? should the message objects be owned by the senders, or be attached to/owned by the Channel object?, what about sequencing of messages?
    msg_count: u64
}

public struct Message has key, store {
    id: UID,
    sender: address, // should we also create some sort of UserProfile object?
    encrypted_text: Option<vector<u8>>, // encrypted text payload
    attachments: vector<AttachmentPointer>,
    // seal_identity: vector<u8> ???
    created_at_ms: u64,
    last_edited_at_ms: Option<u64>
}

public struct AttachmentPointer has store {
    encrypted_filename: vector<u8>,
    encrypted_mimetype: vector<u8>,
    encrypted_size_in_bytes: vector<u8>, // will need to pad the payload, because seal encryption doesnt hide that info
    blob_CID: u256, // or maybe encrypt this as well,
    // seal_identity / nonce ???
}

/*

Spam handling? —> Block user? what about 1-1? Should there be a request when someone wants to add you? and I guess the request could also contain an initial message?

Channel administration —> AdminPermissions? 

Extensibility

Configurability

*/
