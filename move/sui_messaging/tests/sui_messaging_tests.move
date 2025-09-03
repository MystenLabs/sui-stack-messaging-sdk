// #[test_only]
// module sui_messaging::sui_messaging_tests;

// TODO: implement one2one flow test:
// - create channel with default config
// - add member
// - creator sends message without attachments
// - other member sends message with 2 attachments

// use std::string::String;
// use sui::clock::Clock;
// use sui::vec_map::VecMap;
// use sui::vec_set::VecSet;
// use sui_messaging::attachment::Attachment;
// use sui_messaging::channel::Channel;
// use sui_messaging::config::Config;
// use sui_messaging::errors;
// use sui_messaging::member_cap::MemberCap;

// // === Test Functions ===
// #[test_only]
// use sui::test_scenario::{Self as ts};

// #[test_only]
// use sui::vec_map;

// #[test_only]
// use sui_messaging::{
//     attachment,
//     channel::{Self, CreatorCap, transfer_creator_cap, transfer_member_cap},
//     permissions::{Role},
// };

// #[test_only]
// use fun send_message as Channel.send_message;

// #[test_only]
// use sui::clock;

// #[test]
// fun test_new_with_defaults() {
//     // Test addresses
//     let sender_address: address = @0xa;
//     let recipient_address: address = @0xb;

//     let mut scenario = ts::begin(sender_address);

//     let mut clock = clock::create_for_testing(scenario.ctx());
//     clock.set_for_testing(1750762503);

//     // === Create a new Channel with default configuration ===
//     scenario.next_tx(sender_address);
//     {
//         // create new channel
//         let (mut channel, creator_cap, creator_member_cap) = channel::new(
//             &clock,
//             scenario.ctx(),
//         );
//         assert!(channel::is_creator(&channel, &creator_cap), errors::e_channel_not_creator());

//         // add defaults
//         channel.with_defaults(&creator_cap);

//         std::debug::print(channel.config());
//         std::debug::print(channel.roles());

//         // === Set initial roles ===
//         let mut initial_roles = vec_map::empty<String, Role>();
//         initial_roles.insert(b"Admin".to_string(), permissions::new_role(permissions::all()));
//         initial_roles.insert(b"User".to_string(), permissions::new_role(permissions::empty()));

//         channel.with_initial_roles(&creator_cap, &mut initial_roles);

//         std::debug::print(channel.roles());

//         // === Set initial members ===
//         let mut initial_members = vec_map::empty<address, String>();
//         initial_members.insert(recipient_address, b"User".to_string());

//         let mut member_caps_map = channel.with_initial_members_with_roles(
//             &creator_cap,
//             &mut initial_members,
//             &clock,
//             scenario.ctx(),
//         );

//         std::debug::print(channel.members());

//         channel.share(&creator_cap);

//         // transfer CreatorCap to sender
//         transfer_creator_cap(creator_cap, sender_address);
//         // transfer creator's MemberCap to sender
//         transfer_member_cap(creator_member_cap, sender_address);

//         // transfer MemberCaps to initial_member_addresses
//         while (!member_caps_map.is_empty()) {
//             let (member_address, member_cap) = member_caps_map.pop();
//             transfer_member_cap(member_cap, member_address);
//         };
//         // destroy the member_caps_map
//         // At this point it should be empty
//         member_caps_map.destroy_empty();
//     };

//     // === Add a wrapped KEK on the Channel ===
//     scenario.next_tx(sender_address);
//     {
//         let mut channel = scenario.take_shared<Channel>();
//         let creator_cap = scenario.take_from_sender<CreatorCap>();

//         // At this stage we are supposed to use Seal
//         let encrypted_key_bytes = channel.namespace();
//         channel.add_encrypted_key(&creator_cap, encrypted_key_bytes);

//         channel.share(&creator_cap);
//         scenario.return_to_sender<CreatorCap>(creator_cap);
//     };

//     // === Send message to the Channel ===
//     scenario.next_tx(sender_address);
//     {
//         let mut channel = scenario.take_shared<Channel>();
//         let creator_cap = scenario.take_from_sender<CreatorCap>();
//         let member_cap = scenario.take_from_sender<MemberCap>();
//         let ciphertext = b"Some text";
//         let nonce = vector[9, 0, 9, 0];
//         let n: u64 = 2;
//         let mut attachments: vector<Attachment> = vector::empty();
//         (n).do!(|i| {
//             attachments.push_back(
//                 attachment::new(
//                     i.to_string(),
//                     vector[1, 2, 3, 4],
//                     vector[9, 10, 11, 12],
//                     vector[13, 14, 15, 16],
//                     channel.latest_encryption_key_version(),
//                 ),
//             );
//         });

//         channel.send_message(
//             &member_cap,
//             ciphertext,
//             nonce,
//             attachments,
//             &clock,
//             scenario.ctx(),
//         );
//         std::debug::print(channel.messages().borrow(0));

//         channel.share(&creator_cap);
//         scenario.return_to_sender<CreatorCap>(creator_cap);
//         scenario.return_to_sender<MemberCap>(member_cap);
//     };

//     clock::destroy_for_testing(clock);
//     scenario.end();
// }
