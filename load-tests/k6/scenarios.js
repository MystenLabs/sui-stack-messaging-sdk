import { sleep } from 'k6';
import http from 'k6/http';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

import { config } from './config.js';
import { metrics } from './metrics.js';

const PROVISIONING_API_URL = 'http://localhost:4321';

function recordMetric(response, metric, errorMetric) {
    const internalDuration = response.headers['X-Internal-Duration'] ? parseFloat(response.headers['X-Internal-Duration']) : 0;
    const adjustedDuration = response.timings.duration - internalDuration;
    metric.add(adjustedDuration);
    errorMetric.add(response.status !== 200);
}

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

export function activeUserWorkflow(data) {
    if (__VU > data.activeUsers.length) {
        console.log(`VU ${__VU} has no active user assigned.`);
        return;
    }
    const user = data.activeUsers[__VU - 1];

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
    if (__VU - 1 - data.activeUsers.length >= data.passiveUsers.length) {
        console.log(`VU ${__VU} has no passive user assigned.`);
        return;
    }
    const user = data.passiveUsers[__VU - 1 - data.activeUsers.length];

    const memberships = fetchChannelMemberships(user.sui_address);
    if (memberships.length === 0) {
        return;
    }
    const channelId = memberships[0].channelId;

    while (true) {
        fetchChannelMessages(channelId);
        sleep(config.passiveUsers.pollingInterval);
    }
}