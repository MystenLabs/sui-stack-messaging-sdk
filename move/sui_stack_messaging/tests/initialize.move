#[test_only]
module sui_stack_messaging::initialize;

use sui::clock::{Self, Clock};
use sui::test_scenario::{Self as ts, Scenario};
use sui_stack_messaging::channel::{Self, Channel};
use sui_stack_messaging::config;
use sui_stack_messaging::member_cap::MemberCap;

// Test addresses
public fun admin(): address { @0xa }
public fun alice(): address { @0xb }
public fun bob(): address { @0xc }

/// Create a test clock with a default timestamp
public fun create_clock(scenario: &mut Scenario): Clock {
    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(1750762503);
    clock
}

/// Create a new channel with default config and return it along with the creator's MemberCap
public fun create_channel_with_creator(
    clock: &Clock,
    scenario: &mut Scenario,
): (Channel, MemberCap) {
    channel::new(config::none(), clock, scenario.ctx())
}

/// Create a channel, share it, and transfer the creator cap to the admin address
public fun setup_shared_channel(
    sender: address,
    clock: &Clock,
    scenario: &mut Scenario,
) {
    scenario.next_tx(sender);
    {
        let (mut channel, creator_member_cap) = create_channel_with_creator(clock, scenario);

        // Add encrypted key (required for valid channel state)
        let encrypted_key_bytes = channel.namespace();
        channel.add_encrypted_key(&creator_member_cap, encrypted_key_bytes);

        channel.share();
        creator_member_cap.transfer_to_recipient(sender);
    };
}

/// Add a new member to the channel and transfer the MemberCap to the specified address
/// Returns the ID of the new MemberCap
public fun add_member_to_channel(
    adder: address,
    recipient: address,
    clock: &Clock,
    scenario: &mut Scenario,
): ID {
    scenario.next_tx(adder);
    let member_cap_id = {
        let mut channel = scenario.take_shared<Channel>();
        let adder_cap = scenario.take_from_sender<MemberCap>();

        let mut new_caps = channel.add_members(&adder_cap, 1, clock, scenario.ctx());
        let new_cap = new_caps.pop_back();
        new_caps.destroy_empty();

        let cap_id = object::id(&new_cap);
        new_cap.transfer_to_recipient(recipient);

        ts::return_shared(channel);
        scenario.return_to_sender(adder_cap);

        cap_id
    };
    member_cap_id
}

/// Cleanup: destroy the clock
public fun cleanup_clock(clock: Clock) {
    clock::destroy_for_testing(clock);
}
