import http from 'k6/http';
import { check } from 'k6';
import sui from 'k6/x/sui';
import { config } from './config.js';
import { metrics } from './metrics.js';

const suiClient = sui.connect(config.rpcUrl);

// --- READ HELPERS (JSON-RPC) ---

export function fetchChannelMemberships(userAddress) {
    const payload = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_getOwnedObjects',
        params: [
            userAddress,
            {
                filter: { StructType: `${config.packageId}::channel::MemberCap` },
                options: { showContent: true }
            },
            null, // cursor
            20    // limit (first page only)
        ],
    });
    const params = { headers: { 'Content-Type': 'application/json' } };
    
    const startTime = Date.now();
    const res = http.post(config.rpcUrl, payload, params);
    const latency = Date.now() - startTime;
    metrics.fetchChannelMemberships_latency.add(latency);

    const isSuccess = check(res, { 'fetch memberships status is 200': (r) => r.status === 200 });
    metrics.errorRate_fetchMemberships.add(!isSuccess);

    // In a real script, you'd parse res.json().result.data to get MemberCap objects
    return isSuccess ? res.json().result.data : [];
}

export function fetchChannelMessages(channelId) {
    // Simulates fetching messages by querying dynamic fields of the channel object
    const payload = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_getDynamicFields',
        params: [channelId, null, 50], // Fetch first 50 dynamic fields (messages)
    });
     const params = { headers: { 'Content-Type': 'application/json' } };

    const startTime = Date.now();
    const res = http.post(config.rpcUrl, payload, params);
    const latency = Date.now() - startTime;
    metrics.fetchChannelMessages_latency.add(latency);

    const isSuccess = check(res, { 'fetch messages status is 200': (r) => r.status === 200 });
    metrics.errorRate_fetchMessages.add(!isSuccess);
    
    return isSuccess ? res.json().result.data : [];
}


// --- WRITE HELPERS (xk6-sui) ---

function executeMoveCall(metricLatency, metricGas, metricErrorRate, moveCallParams) {
    const startTime = Date.now();
    // The xk6-sui extension returns the response directly
    const res = sui.moveCall(suiClient, ...Object.values(moveCallParams)); 
    const latency = Date.now() - startTime;

    metricLatency.add(latency);
    
    const isSuccess = check(res, { 'transaction is successful': (r) => r && r.effects.status.status === 'success' });
    metricErrorRate.add(!isSuccess);

    if (isSuccess) {
        metricGas.add(res.effects.gasUsed.computationCost + res.effects.gasUsed.storageCost - res.effects.gasUsed.storageRebate);
        return res; // Return the full response for data extraction
    }
    return null;
}

export function createChannel(creator, typeArgs, args) {
    return executeMoveCall(
        metrics.createChannel_latency,
        metrics.createChannel_gas,
        metrics.errorRate_createChannel,
        {
            pkgId: config.packageId,
            modName: 'channel',
            fnName: 'new',
            mnemonic: creator.secretKey,
            gasCoinId: creator.gasCoin,
            args,
            typeArgs,
            gasBudget: config.gasBudget
        }
    );
}

// ... Implement similar wrappers for addMember and sendMessage