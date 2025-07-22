import { sleep } from 'k6';
import http from 'k6/http';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

import { config } from './config.js';
import { metrics, recordMetric } from './metrics.js';

const PROVISIONING_API_URL = 'http://localhost:4321';



function fetchChannelMemberships(userAddress) {
    const url = `${PROVISIONING_API_URL}/contract/channel/memberships/${userAddress}`;
    const res = http.get(url);
    recordMetric(res, metrics.fetchChannelMemberships_latency, metrics.errorRate_fetchMemberships);
    if (res.status !== 200) {
        console.error(`Failed to fetch memberships for ${userAddress}:`, res.body);
        return [];
    }
    return JSON.parse(res.body).memberships;
}

function fetchChannelMembershipsWithMetadata(userAddress) {
    const url = `${PROVISIONING_API_URL}/contract/channel/memberships/${userAddress}/with-metadata`;
    const res = http.get(url);
    recordMetric(res, metrics.fetchChannelMembershipsWithMetadata_latency, metrics.errorRate_fetchMembershipsWithMetadata);
    if (res.status !== 200) {
        console.error(`Failed to fetch memberships with metadata for ${userAddress}:`, res.body);
        return [];
    }
    return JSON.parse(res.body).memberships;
}

function sendMessage(secretKey, channelId, memberCapId, message) {
    const url = `${PROVISIONING_API_URL}/contract/channel/message`;
    const payload = JSON.stringify({
        secret_key: secretKey,
        channel_id: channelId,
        member_cap_id: memberCapId,
        message: message,
    });
    const params = { headers: { 'Content-Type': 'application/json' } };
    const res = http.post(url, payload, params);
    recordMetric(res, metrics.sendMessage_latency, metrics.errorRate_sendMessage);
    // Gas cost metrics
    metrics.sendMessage_gas.add(res.headers['X-Gas-Cost'] ? parseFloat(res.headers['X-Gas-Cost']) : 0);
}

function fetchChannelMessages(channelId) {
    const url = `${PROVISIONING_API_URL}/contract/channel/${channelId}/messages`;
    const res = http.get(url);
    recordMetric(res, metrics.fetchChannelMessages_latency, metrics.errorRate_fetchMessages);
    if (res.status !== 200) {
        console.error(`Failed to fetch messages for channel ${channelId}:`, res.body);
        return [];
    }
    return JSON.parse(res.body).messages;
}

function fetchChannelMessagesByTableId(tableId) {
    const url = `${PROVISIONING_API_URL}/contract/messages/table/${tableId}`;
    const res = http.get(url);
    recordMetric(res, metrics.fetchChannelMessagesByTableId_latency, metrics.errorRate_fetchMessagesByTableId);
    if (res.status !== 200) {
        console.error(`Failed to fetch messages for table ${tableId}:`, res.body);
        return [];
    }
    return JSON.parse(res.body).messages;
}

export function activeUserWorkflow(data) {
    // Use modulo to cycle through available users if there are more VUs than users
    const userIndex = (__VU - 1) % data.activeUsers.length;
    const user = data.activeUsers[userIndex];

    const memberships = fetchChannelMemberships(user.sui_address);
    if (memberships.length === 0) {
        console.log(`User ${user.sui_address} has no channels to message.`);
        return;
    }

    const channelId = memberships[0].channelId;
    const memberCapId = memberships[0].memberCapId;

    for (let i = 0; i < config.activeUsers.messagesPerSession; i++) {
        sleep(randomIntBetween(config.activeUsers.thinkTimeSecMin, config.activeUsers.thinkTimeSecMax));
        sendMessage(user.secret_key, channelId, memberCapId, `Hello from ${user.sui_address}`);
    }
}

export function passiveUserWorkflow(data) {
    // For passive users, we need to account for the fact that VUs are numbered starting from 1
    // and we want to assign passive users to VUs that come after active users
    const passiveUserIndex = (__VU - 1) % data.passiveUsers.length;
    const user = data.passiveUsers[passiveUserIndex];

    const memberships = fetchChannelMembershipsWithMetadata(user.sui_address);
    if (memberships.length === 0) {
        console.log(`User ${user.sui_address} has no channels to fetch messages from.`);
        return;
    }

    // Select random channel to fetch messages from  
    const randomMembership = memberships[randomIntBetween(0, memberships.length - 1)];
    if (!randomMembership.channel || !randomMembership.channel.messagesTableId) {
        console.error(`User ${user.sui_address} has no channel to fetch messages from.`);
        return;
    }

    const tableId = randomMembership.channel.messagesTableId;

    // Poll for new messages
    while (true) {
        const messages = fetchChannelMessagesByTableId(tableId);
        if (messages.length > 0) {
            console.log(`User ${user.sui_address} received ${messages.length} new messages.`);
        }
        sleep(config.passiveUsers.pollingInterval);
    }
}