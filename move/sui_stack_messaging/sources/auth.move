module sui_stack_messaging::auth;

use std::type_name::{Self, TypeName};
use sui::vec_map::{Self, VecMap};
use sui::vec_set::{Self, VecSet};
use sui::versioned::{Self, Versioned};
use sui_stack_messaging::admin;
use sui_stack_messaging::config::{Self, Config};

const ENotPermitted: u64 = 0;

public struct Auth has store {
    member_permissions: VecMap<ID, VecSet<TypeName>>,
    // We want the config here, in order to check the number of members
    config: Versioned,
}

public struct EditPermissions() has drop;

public(package) fun new(
    creator_member_cap_id: ID,
    mut config: Option<Config>,
    ctx: &mut TxContext,
): Auth {
    let permissions = vec_set::singleton(type_name::get<EditPermissions>());
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
    self.member_permissions.get(&member_cap_id).contains(&type_name::get<WPermission>())
}

public(package) fun grant_permission<WPermission: drop>(
    self: &mut Auth,
    granter_member_cap_id: ID,
    member_cap_id: ID,
) {
    // assert granter can grant permissions
    assert!(self.has_permission<EditPermissions>(granter_member_cap_id), ENotPermitted);
    // check if id already an entry
    if (self.member_permissions.contains(&member_cap_id)) {
        self.member_permissions.get_mut(&member_cap_id).insert(type_name::get<WPermission>());
    } else {
        let config = self.config.load_value<Config>();
        let at_max_members = self.member_permissions.size() == config.max_channel_members();
        assert!(!at_max_members, 420);

        let permissions = vec_set::singleton(type_name::get<WPermission>());
        self.member_permissions.insert(member_cap_id, permissions);
    }
}

public(package) fun revoke_permission<WPermission: drop>(
    self: &mut Auth,
    revoker_member_cap_id: ID,
    member_cap_id: ID,
) {
    // assert revoker can revoke permissions
    assert!(self.has_permission<EditPermissions>(revoker_member_cap_id), ENotPermitted);

    let member_entry = self.member_permissions.get_mut(&member_cap_id);
    member_entry.remove(&type_name::get<WPermission>());

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
    // assert revoker can revoke permissions
    assert!(self.has_permission<EditPermissions>(remover_member_cap_id), ENotPermitted);
    self.member_permissions.remove(&member_cap_id);
}

public(package) fun config(self: &Auth): &Config {
    self.config.load_value<Config>()
}
