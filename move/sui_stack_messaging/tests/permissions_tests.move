#[test_only]
module sui_stack_messaging::permissions_tests;

use sui::test_scenario::{Self as ts};
use sui_stack_messaging::channel::{Channel, SendMessage};
use sui_stack_messaging::initialize::{Self, admin, alice, bob};
use sui_stack_messaging::member_cap::MemberCap;
use sui_stack_messaging::auth::ManagePermissions;

/// Test that creator has all permissions by default
#[test]
fun test_creator_has_all_permissions() {
    let mut scenario = ts::begin(admin());
    let clock = initialize::create_clock(&mut scenario);

    initialize::setup_shared_channel(admin(), &clock, &mut scenario);

    // Creator should be able to send messages (has SendMessage permission)
    scenario.next_tx(admin());
    {
        let mut channel = scenario.take_shared<Channel>();
        let admin_cap = scenario.take_from_sender<MemberCap>();

        // This should succeed - creator has SendMessage permission
        let ciphertext = b"Test message";
        let nonce = vector[1, 2, 3, 4];
        channel.send_message(
            &admin_cap,
            ciphertext,
            nonce,
            vector[],
            &clock,
            scenario.ctx(),
        );

        assert!(channel.messages_count() == 1, 0);

        ts::return_shared(channel);
        scenario.return_to_sender(admin_cap);
    };

    initialize::cleanup_clock(clock);
    scenario.end();
}

/// Test that new members only have ReadMessages permission by default
#[test]
#[expected_failure(abort_code = sui_stack_messaging::channel::ENotPermitted)]
fun test_new_member_cannot_send_without_permission() {
    let mut scenario = ts::begin(admin());
    let clock = initialize::create_clock(&mut scenario);

    initialize::setup_shared_channel(admin(), &clock, &mut scenario);
    let _alice_cap_id = initialize::add_member_to_channel(admin(), alice(), &clock, &mut scenario);

    // Alice tries to send a message without SendMessage permission
    scenario.next_tx(alice());
    {
        let mut channel = scenario.take_shared<Channel>();
        let alice_cap = scenario.take_from_sender<MemberCap>();

        let ciphertext = b"Test message";
        let nonce = vector[1, 2, 3, 4];

        // This should fail - alice only has ReadMessages permission
        channel.send_message(
            &alice_cap,
            ciphertext,
            nonce,
            vector[],
            &clock,
            scenario.ctx(),
        );

        ts::return_shared(channel);
        scenario.return_to_sender(alice_cap);
    };

    initialize::cleanup_clock(clock);
    scenario.end();
}

/// Test promoting a member grants them the permission
#[test]
fun test_promote_member_grants_send_permission() {
    let mut scenario = ts::begin(admin());
    let clock = initialize::create_clock(&mut scenario);

    initialize::setup_shared_channel(admin(), &clock, &mut scenario);
    let alice_cap_id = initialize::add_member_to_channel(admin(), alice(), &clock, &mut scenario);

    // Admin promotes alice to have SendMessage permission
    scenario.next_tx(admin());
    {
        let mut channel = scenario.take_shared<Channel>();
        let admin_cap = scenario.take_from_sender<MemberCap>();

        channel.promote_member<SendMessage>(&admin_cap, alice_cap_id, &clock);

        ts::return_shared(channel);
        scenario.return_to_sender(admin_cap);
    };

    // Now alice should be able to send messages
    scenario.next_tx(alice());
    {
        let mut channel = scenario.take_shared<Channel>();
        let alice_cap = scenario.take_from_sender<MemberCap>();

        let ciphertext = b"Test message from Alice";
        let nonce = vector[1, 2, 3, 4];

        // This should now succeed
        channel.send_message(
            &alice_cap,
            ciphertext,
            nonce,
            vector[],
            &clock,
            scenario.ctx(),
        );

        assert!(channel.messages_count() == 1, 0);

        ts::return_shared(channel);
        scenario.return_to_sender(alice_cap);
    };

    initialize::cleanup_clock(clock);
    scenario.end();
}

/// Test that only members with ManagePermissions can promote others
#[test]
#[expected_failure(abort_code = sui_stack_messaging::auth::ENotPermitted)]
fun test_non_admin_cannot_promote() {
    let mut scenario = ts::begin(admin());
    let clock = initialize::create_clock(&mut scenario);

    initialize::setup_shared_channel(admin(), &clock, &mut scenario);
    let _alice_cap_id = initialize::add_member_to_channel(admin(), alice(), &clock, &mut scenario);
    let bob_cap_id = initialize::add_member_to_channel(admin(), bob(), &clock, &mut scenario);

    // Alice tries to promote Bob (should fail - Alice doesn't have ManagePermissions)
    scenario.next_tx(alice());
    {
        let mut channel = scenario.take_shared<Channel>();
        let alice_cap = scenario.take_from_sender<MemberCap>();

        // This should fail - alice doesn't have ManagePermissions
        channel.promote_member<SendMessage>(&alice_cap, bob_cap_id, &clock);

        ts::return_shared(channel);
        scenario.return_to_sender(alice_cap);
    };

    initialize::cleanup_clock(clock);
    scenario.end();
}

/// Test demoting a member revokes their permission
#[test]
#[expected_failure(abort_code = sui_stack_messaging::channel::ENotPermitted)]
fun test_demote_member_revokes_permission() {
    let mut scenario = ts::begin(admin());
    let clock = initialize::create_clock(&mut scenario);

    initialize::setup_shared_channel(admin(), &clock, &mut scenario);
    let alice_cap_id = initialize::add_member_to_channel(admin(), alice(), &clock, &mut scenario);

    // First, promote alice to have SendMessage
    scenario.next_tx(admin());
    {
        let mut channel = scenario.take_shared<Channel>();
        let admin_cap = scenario.take_from_sender<MemberCap>();

        channel.promote_member<SendMessage>(&admin_cap, alice_cap_id, &clock);

        ts::return_shared(channel);
        scenario.return_to_sender(admin_cap);
    };

    // Alice sends a message successfully
    scenario.next_tx(alice());
    {
        let mut channel = scenario.take_shared<Channel>();
        let alice_cap = scenario.take_from_sender<MemberCap>();

        channel.send_message(
            &alice_cap,
            b"Message 1",
            vector[1, 2, 3, 4],
            vector[],
            &clock,
            scenario.ctx(),
        );

        ts::return_shared(channel);
        scenario.return_to_sender(alice_cap);
    };

    // Now demote alice
    scenario.next_tx(admin());
    {
        let mut channel = scenario.take_shared<Channel>();
        let admin_cap = scenario.take_from_sender<MemberCap>();

        channel.demote_member<SendMessage>(&admin_cap, alice_cap_id, &clock);

        ts::return_shared(channel);
        scenario.return_to_sender(admin_cap);
    };

    // Alice tries to send another message (should fail)
    scenario.next_tx(alice());
    {
        let mut channel = scenario.take_shared<Channel>();
        let alice_cap = scenario.take_from_sender<MemberCap>();

        // This should fail - alice no longer has SendMessage permission
        channel.send_message(
            &alice_cap,
            b"Message 2",
            vector[1, 2, 3, 4],
            vector[],
            &clock,
            scenario.ctx(),
        );

        ts::return_shared(channel);
        scenario.return_to_sender(alice_cap);
    };

    initialize::cleanup_clock(clock);
    scenario.end();
}

/// Test that granting ManagePermissions allows a member to promote others
#[test]
fun test_delegate_manage_permissions() {
    let mut scenario = ts::begin(admin());
    let clock = initialize::create_clock(&mut scenario);

    initialize::setup_shared_channel(admin(), &clock, &mut scenario);
    let alice_cap_id = initialize::add_member_to_channel(admin(), alice(), &clock, &mut scenario);
    let bob_cap_id = initialize::add_member_to_channel(admin(), bob(), &clock, &mut scenario);

    // Admin grants ManagePermissions to Alice
    scenario.next_tx(admin());
    {
        let mut channel = scenario.take_shared<Channel>();
        let admin_cap = scenario.take_from_sender<MemberCap>();

        channel.promote_member<ManagePermissions>(&admin_cap, alice_cap_id, &clock);

        ts::return_shared(channel);
        scenario.return_to_sender(admin_cap);
    };

    // Now Alice can promote Bob
    scenario.next_tx(alice());
    {
        let mut channel = scenario.take_shared<Channel>();
        let alice_cap = scenario.take_from_sender<MemberCap>();

        // This should succeed - alice now has ManagePermissions
        channel.promote_member<SendMessage>(&alice_cap, bob_cap_id, &clock);

        ts::return_shared(channel);
        scenario.return_to_sender(alice_cap);
    };

    // Bob should now be able to send messages
    scenario.next_tx(bob());
    {
        let mut channel = scenario.take_shared<Channel>();
        let bob_cap = scenario.take_from_sender<MemberCap>();

        channel.send_message(
            &bob_cap,
            b"Bob's message",
            vector[1, 2, 3, 4],
            vector[],
            &clock,
            scenario.ctx(),
        );

        assert!(channel.messages_count() == 1, 0);

        ts::return_shared(channel);
        scenario.return_to_sender(bob_cap);
    };

    initialize::cleanup_clock(clock);
    scenario.end();
}
