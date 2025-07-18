import { sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

import { config } from './config.js';

export function activeUserWorkflow(data) {
    // TODO: make sure all users get assigned a VU
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

    for (let i=0; i<config.activeUsers.messagesPerSession; i++) {
       
        
        // Think time
        sleep(randomIntBetween(config.activeUsers.thinkTimeSecMin, config.activeUsers.thinkTimeSecMax));

        // TODO: Send message
    }
    
    
}

export function passiveUserWorkflow(data) {
    // TODO: make sure all users get assigned a VU
    const user = data.passiveUsers[__VU - 1 - config.activeUsers.total]; 
    
    // 1. Discover channels
    // TODO: const memberships = fetchChannelMemberships(user.address);
    if (memberships.length === 0) {
        return;
    }
    const channelId = memberships[0].data.content.fields.channel_id;

    // 2. Poll for messages
    while (true) { // This will run for the test duration
        // fetchChannelMessages(channelId, memberCapId);
        sleep(config.passiveUsers.pollingInterval); // Polling interval
    }
}