// load-testing/scenarios.js
import { sleep } from 'k6';
import { fetchChannelMemberships, fetchChannelMessages, sendMessage } from './sui-helpers.js';
import { crypto } from "k6/crypto";

export function activeUserWorkflow(data) {
    // A VU is one of the active users passed from setup
    const user = data.activeUsers[__VU - 1]; 
    
    // 1. Discover channels this user is a member of
    const memberships = fetchChannelMemberships(user.address);
    if (memberships.length === 0) {
        console.log(`User ${user.address} has no channels to message.`);
        return;
    }
    
    // 2. Send messages periodically
    const channelId = memberships[0].data.content.fields.channel_id; // Pick first channel
    const memberCapId = memberships[0].data.objectId;

    // Simulate E2EE workload
    const key = crypto.randomBytes(32); // Simulate DEK
    const plaintext = `Hello from active user ${__VU} at ${new Date().toISOString()}`;
    const ciphertext = crypto.subtle.encrypt('aes-gcm', key, plaintext, new Uint8Array(12));

    // sendMessage(user, channelId, memberCapId, ciphertext); // Simplified call
    
    sleep(10); // Think time
}

export function passiveUserWorkflow(data) {
    const user = data.passiveUsers[__VU - 1 - config.activeUsers.total];
    
    // 1. Discover channels
    const memberships = fetchChannelMemberships(user.address);
    if (memberships.length === 0) {
        return;
    }
    const channelId = memberships[0].data.content.fields.channel_id;

    // 2. Poll for messages
    while (true) { // This will run for the test duration
        fetchChannelMessages(channelId);
        sleep(5); // Polling interval
    }
}