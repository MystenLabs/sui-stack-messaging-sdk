module sui_messaging::auth;

use std::type_name::{Self, TypeName};
use sui::config::Config;
use sui::table::{Self, Table};
use sui::vec_set::{Self, VecSet};

const ENotPermitted: u64 = 0;

public struct Auth has store {
    member_permissions: Table<ID, VecSet<TypeName>>,
    // We want the config here, in order to check the number of members
    // confit: Config; // TODO: std::VERSIONED
}

public struct EditPermissions() has drop;

public(package) fun new(creator_id: ID, ctx: &mut TxContext): Auth {
    let permissions = vec_set::singleton(type_name::get<EditPermissions>());
    let member_permissions = table::new<ID, VecSet<TypeName>>(ctx);
    member_permissions.add(creator_id, permissions);
    Auth {
        member_permissions,
    }
}

public(package) fun has_permission<TPermission: drop>(self: &Auth, member_id: ID): bool {
    self.member_permissions.borrow(member_id).contains(&type_name::get<TPermission>())
}

public(package) fun grant_permission<TPermission: drop>(
    self: &mut Auth,
    granter_id: ID,
    member_id: ID,
) {
    // assert granter can grant permissions
    assert!(self.has_permission<EditPermissions>(granter_id), ENotPermitted);

    self.member_permissions.borrow_mut(member_id).insert(type_name::get<TPermission>());
}

public(package) fun revoke_permission<TPermission: drop>(
    self: &mut Auth,
    revoker_id: ID,
    member_id: ID,
) {
    // assert revoker can revoke permissions
    assert!(self.has_permission<EditPermissions>(revoker_id), ENotPermitted);

    self.member_permissions.borrow_mut(member_id).remove(&type_name::get<TPermission>());
}
