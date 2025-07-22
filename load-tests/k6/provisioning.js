import http from 'k6/http';
import { config } from './config.js';
import { metrics, recordMetric } from './metrics.js';

const PROVISIONING_API_URL = 'http://localhost:4321';

function generateUsers(variant, count) {
    const url = `${PROVISIONING_API_URL}/users/generate/${variant}?count=${count}`;
    const res = http.post(url);
    if (res.status !== 200) {
        console.error(`Failed to generate ${variant} users:`, res.body);
        return null;
    }
    return JSON.parse(res.body).users;
}

function fundUsers() {
    const url = `${PROVISIONING_API_URL}/users/fund`;
    const payload = JSON.stringify({
        sui_address: config.fundingAccount.address,
        secret_key: config.fundingAccount.secretKey,
        amount_per_user: config.fundingAccount.amountPerUser,
    });
    const params = { headers: { 'Content-Type': 'application/json' } };
    const res = http.post(url, payload, params);
    if (res.status !== 200) {
        console.error('Failed to fund users:', res.body);
        return false;
    }
    console.log(JSON.parse(res.body).message);
    return true;
}

function fetchUsers(variant, isFunded, limit = 100) {
    let url = `${PROVISIONING_API_URL}/users/with-secrets?variant=${variant}&limit=${limit}`;
    if (isFunded !== undefined) {
        url += `&is_funded=${isFunded}`;
    }
    const res = http.get(url);
    if (res.status !== 200) {
        console.error(`Failed to fetch ${variant} users:`, res.body);
        return [];
    }
    return JSON.parse(res.body).items;
}

function createChannel(channelName, initialMembers) {
    const url = `${PROVISIONING_API_URL}/contract/channel`;
    const payload = JSON.stringify({
        secret_key: config.fundingAccount.secretKey,
        channel_name: channelName,
        initial_members: initialMembers,
    });
    const params = { headers: { 'Content-Type': 'application/json' } };
    const res = http.post(url, payload, params);
    recordMetric(res, metrics.createChannel_latency, metrics.errorRate_createChannel);

    // Gas cost metrics
    metrics.createChannel_gas.add(res.headers['X-Gas-Cost'] ? parseFloat(res.headers['X-Gas-Cost']) : 0);

    if (res.status !== 200) {
        console.error('Failed to create channel:', res.body);
        return null;
    }
    return JSON.parse(res.body).channel;
}

export function setupTestEnvironment() {
    console.log("Setting up the test environment...");

    // 1. Generate users if needed
    let activeUsers = fetchUsers('active', undefined, config.activeUsers.total);
    if (activeUsers.length < config.activeUsers.total) {
        console.log(`Generating ${config.activeUsers.total - activeUsers.length} active users...`);
        generateUsers('active', config.activeUsers.total - activeUsers.length);
    }

    let passiveUsers = fetchUsers('passive', undefined, config.passiveUsers.total);
    if (passiveUsers.length < config.passiveUsers.total) {
        console.log(`Generating ${config.passiveUsers.total - passiveUsers.length} passive users...`);
        generateUsers('passive', config.passiveUsers.total - passiveUsers.length);
    }
    
    // 2. Fund active users
    const activeUsersToFund = fetchUsers('active', false, config.activeUsers.total);
    if (activeUsersToFund.length > 0) {
        console.log(`Funding ${activeUsersToFund.length} active users...`);
        fundUsers();
    }

    // 3. Fetch all provisioned users
    const allActiveUsers = fetchUsers('active', true, config.activeUsers.total);
    const allPassiveUsers = fetchUsers('passive', false, config.passiveUsers.total);

    // 4. Create channels and distribute users according to perChannel constraints
    const totalUsersPerChannel = config.activeUsers.perChannel + config.passiveUsers.perChannel;
    const requiredChannels = Math.max(
        Math.ceil(allActiveUsers.length / config.activeUsers.perChannel),
        Math.ceil(allPassiveUsers.length / config.passiveUsers.perChannel)
    );
    
    console.log(`Creating ${requiredChannels} channels with ${config.activeUsers.perChannel} active and ${config.passiveUsers.perChannel} passive users per channel...`);

    for (let i = 0; i < requiredChannels; i++) {
        const channelName = `channel-${i}`;
        
        // Distribute active users
        const activeStartIndex = i * config.activeUsers.perChannel;
        const activeEndIndex = Math.min(activeStartIndex + config.activeUsers.perChannel, allActiveUsers.length);
        const activeMembers = allActiveUsers.slice(activeStartIndex, activeEndIndex).map(u => u.sui_address);
        
        // Distribute passive users
        const passiveStartIndex = i * config.passiveUsers.perChannel;
        const passiveEndIndex = Math.min(passiveStartIndex + config.passiveUsers.perChannel, allPassiveUsers.length);
        const passiveMembers = allPassiveUsers.slice(passiveStartIndex, passiveEndIndex).map(u => u.sui_address);
        
        // Combine members for this channel
        const channelMembers = [...activeMembers, ...passiveMembers];
        
        if (channelMembers.length > 0) {
            createChannel(channelName, channelMembers);
        }
    }

    console.log("Setup complete!");

    return {
        activeUsers: allActiveUsers,
        passiveUsers: allPassiveUsers,
    };
}