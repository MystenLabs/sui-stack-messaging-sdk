module sui_messaging::auth;

use std::type_name::{Self, TypeName};
use sui::config::Config;
use sui::vec_map::{Self, VecMap};
use sui::vec_set::{Self, VecSet};

const ENotPermitted: u64 = 0;

public struct Auth has store {
    member_permissions: VecMap<ID, VecSet<TypeName>>,
    // We want the config here, in order to check the number of members
    // confit: Config; // TODO: std::VERSIONED
}

public struct EditPermissions() has drop;

public(package) fun new(creator_member_cap_id: ID, ctx: &mut TxContext): Auth {
    let permissions = vec_set::singleton(type_name::get<EditPermissions>());
    let member_permissions = vec_map::empty<ID, VecSet<TypeName>>();
    member_permissions.insert(creator_member_cap_id, permissions);
    Auth {
        member_permissions,
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

    self.member_permissions.get_mut(&member_cap_id).insert(type_name::get<WPermission>());
}

public(package) fun revoke_permission<WPermission: drop>(
    self: &mut Auth,
    revoker_member_cap_id: ID,
    member_cap_id: ID,
) {
    // assert revoker can revoke permissions
    assert!(self.has_permission<EditPermissions>(revoker_member_cap_id), ENotPermitted);

    self.member_permissions.get_mut(&member_cap_id).remove(&type_name::get<WPermission>());
}
