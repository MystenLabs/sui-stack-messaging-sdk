module sui_stack_messaging::auth;

use std::type_name::{Self, TypeName};
use sui::vec_map::{Self, VecMap};
use sui::vec_set::{Self, VecSet};
use sui::versioned::{Self, Versioned};
use sui_stack_messaging::admin;
use sui_stack_messaging::config::{Self, Config};

const ENotPermitted: u64 = 0;
const EMemberAlreadyExists: u64 = 1;
const ECannotGrantManagePermissionsOnMemberAdd: u64 = 2;
const EMaxChannelMembersReached: u64 = 3;
const EMemberNotFound: u64 = 4;

public struct Auth has store {
    member_permissions: VecMap<ID, VecSet<TypeName>>,
    // We want the config here, in order to check the number of members
    config: Versioned,
}

// Fine-grained permission types
public struct AddMemberEntry() has drop;
public struct RemoveMemberEntry() has drop;
public struct ManagePermissions() has drop;

public(package) fun new(
    creator_member_cap_id: ID,
    mut config: Option<Config>,
    ctx: &mut TxContext,
): Auth {
    let permissions = vec_set::singleton(type_name::with_defining_ids<ManagePermissions>());
    let mut member_permissions = vec_map::empty<ID, VecSet<TypeName>>();
    member_permissions.insert(creator_member_cap_id, permissions);
    let config_val = if (config.is_none()) {
        config::default()
    } else {
        config.extract()
    };
    Auth {
        member_permissions,
        config: versioned::create<Config>(admin::version(), config_val, ctx),
    }
}

public(package) fun has_permission<WPermission: drop>(self: &Auth, member_cap_id: ID): bool {
    self
        .member_permissions
        .get(&member_cap_id)
        .contains(&type_name::with_defining_ids<WPermission>())
}

public(package) fun add_member_entry<InitialPermission: drop>(
    self: &mut Auth,
    adder_member_cap_id: ID,
    member_cap_id: ID,
) {
    // Check AddMemberEntry permission
    assert!(self.has_permission<AddMemberEntry>(adder_member_cap_id), ENotPermitted);

    // Ensure member doesn't already exist
    assert!(!self.member_permissions.contains(&member_cap_id), EMemberAlreadyExists);

    // Security check: Cannot grant ManagePermissions via add_member_entry
    let perm_type = type_name::with_defining_ids<InitialPermission>();
    assert!(
        perm_type != type_name::with_defining_ids<ManagePermissions>(),
        ECannotGrantManagePermissionsOnMemberAdd,
    );

    // Check max members constraint
    let config = self.config.load_value<Config>();
    assert!(
        self.member_permissions.length() < config.max_channel_members(),
        EMaxChannelMembersReached,
    );

    // Create entry with initial permission
    let permissions = vec_set::singleton(perm_type);
    self.member_permissions.insert(member_cap_id, permissions);
}

public(package) fun grant_permission<WPermission: drop>(
    self: &mut Auth,
    granter_member_cap_id: ID,
    member_cap_id: ID,
) {
    // assert granter can grant permissions
    assert!(self.has_permission<ManagePermissions>(granter_member_cap_id), ENotPermitted);

    // Member must already exist
    assert!(self.member_permissions.contains(&member_cap_id), EMemberNotFound);

    let member_perms = self.member_permissions.get_mut(&member_cap_id);
    member_perms.insert(type_name::with_defining_ids<WPermission>());
}

public(package) fun revoke_permission<WPermission: drop>(
    self: &mut Auth,
    revoker_member_cap_id: ID,
    member_cap_id: ID,
) {
    // assert revoker can revoke permissions
    assert!(self.has_permission<ManagePermissions>(revoker_member_cap_id), ENotPermitted);

    let member_entry = self.member_permissions.get_mut(&member_cap_id);
    member_entry.remove(&type_name::with_defining_ids<WPermission>());

    // If entry has no permissions after this revokation, remove member_cap_id entirely
    if (member_entry.is_empty()) {
        self.member_permissions.remove(&member_cap_id);
    }
}

public(package) fun remove_member_entry(
    self: &mut Auth,
    remover_member_cap_id: ID,
    member_cap_id: ID,
) {
    // assert remover has RemoveMemberEntry permission
    assert!(self.has_permission<RemoveMemberEntry>(remover_member_cap_id), ENotPermitted);
    self.member_permissions.remove(&member_cap_id);
}

public(package) fun config(self: &Auth): &Config {
    self.config.load_value<Config>()
}
