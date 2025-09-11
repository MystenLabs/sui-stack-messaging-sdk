#[test_only]
module sui_stack_messaging::sui_stack_messaging_tests;

use sui_stack_messaging::attachment::Attachment;
use sui_stack_messaging::channel::{Self, Channel};
use sui_stack_messaging::config;
use sui_stack_messaging::creator_cap::CreatorCap;
use sui_stack_messaging::member_cap::MemberCap;

// TODO: implement one2one flow test:
// - create channel with default config
// - add member
// - send message with 2 attachments

const ENotCreator: u64 = 0;
const ENotMember: u64 = 1;
const ENotEnoughMessages: u64 = 2;

// === Test Functions ===
#[test_only]
use sui::test_scenario::{Self as ts};

#[test_only]
use sui_stack_messaging::{attachment};

#[test_only]
use sui::clock;

#[test]
fun test_new_with_defaults() {
    // Test addresses
    let sender_address: address = @0xa;
    let recipient_address: address = @0xb;

    let mut scenario = ts::begin(sender_address);

    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(1750762503);

    // === Create a new Channel with default configuration ===
    scenario.next_tx(sender_address);
    {
        // create new channel
        let (mut channel, creator_cap, creator_member_cap) = channel::new(
            config::none(),
            &clock,
            scenario.ctx(),
        );
        assert!(channel.is_creator(&creator_cap), ENotCreator);
        assert!(channel.is_member(&creator_member_cap), ENotMember);

        std::debug::print(&channel);

        // === Set initial members ===
        let mut recipient_member_caps = channel.add_members(
            &creator_member_cap,
            1,
            &clock,
            scenario.ctx(),
        );

        std::debug::print(&channel);

        channel.share(&creator_cap);

        // transfer creator's MemberCap to sender
        creator_member_cap.transfer_to_recipient(&creator_cap, sender_address);

        // transfer MemberCaps to initial_member_addresses
        while (!recipient_member_caps.is_empty()) {
            let (member_cap) = recipient_member_caps.pop_back();
            member_cap.transfer_to_recipient(&creator_cap, recipient_address);
        };
        // shoud be empty after the while loop
        recipient_member_caps.destroy_empty();

        // transfer CreatorCap to sender
        creator_cap.transfer_to_sender(scenario.ctx());
    };

    // === Add a wrapped KEK on the Channel ===
    scenario.next_tx(sender_address);
    {
        let mut channel = scenario.take_shared<Channel>();
        let creator_cap = scenario.take_from_sender<CreatorCap>();
        let creator_member_cap = scenario.take_from_sender<MemberCap>();

        // At this stage we are supposed to use Seal
        let encrypted_key_bytes = channel.namespace();
        channel.add_encrypted_key(&creator_member_cap, encrypted_key_bytes);

        channel.share(&creator_cap);
        scenario.return_to_sender<CreatorCap>(creator_cap);
        scenario.return_to_sender<MemberCap>(creator_member_cap);
    };

    // === Send message to the Channel ===
    scenario.next_tx(sender_address);
    {
        let mut channel = scenario.take_shared<Channel>();
        let creator_cap = scenario.take_from_sender<CreatorCap>();
        let member_cap = scenario.take_from_sender<MemberCap>();
        let ciphertext = b"Some text";
        let nonce = vector[9, 0, 9, 0];
        let n: u64 = 2;
        let mut attachments: vector<Attachment> = vector::empty();
        (n).do!(|i| {
            attachments.push_back(
                attachment::new(
                    i.to_string(),
                    vector[1, 2, 3, 4],
                    vector[9, 10, 11, 12],
                    vector[13, 14, 15, 16],
                    channel.latest_encryption_key_version(),
                ),
            );
        });

        channel.send_message(
            &member_cap,
            ciphertext,
            nonce,
            attachments,
            &clock,
            scenario.ctx(),
        );

        assert!(channel.messages_count() == 1, ENotEnoughMessages);
        std::debug::print(&channel);

        channel.share(&creator_cap);
        scenario.return_to_sender<CreatorCap>(creator_cap);
        scenario.return_to_sender<MemberCap>(member_cap);
    };

    clock::destroy_for_testing(clock);
    scenario.end();
}
