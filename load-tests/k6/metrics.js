import { Trend, Rate, Gauge } from 'k6/metrics';

export const metrics = {
    // Latency Metrics (Trend)
    createChannel_latency: new Trend('createChannel_latency', true),
    addMember_latency: new Trend('addMember_latency', true),
    sendMessage_latency: new Trend('sendMessage_latency', true),
    fetchChannelMemberships_latency: new Trend('fetchChannelMemberships_latency', true),
    fetchChannelMembershipsWithMetadata_latency: new Trend('fetchChannelMembershipsWithMetadata_latency', true),
    fetchChannelMessages_latency: new Trend('fetchChannelMessages_latency', true),
    fetchChannelMessagesByTableId_latency: new Trend('fetchChannelMessagesByTableId_latency', true),

    // Gas Cost Metrics (Gauge)
    createChannel_gas: new Gauge('createChannel_gas'),
    addMember_gas: new Gauge('addMember_gas'),
    sendMessage_gas: new Gauge('sendMessage_gas'),

    // Error Rate Metrics (Rate)
    errorRate_createChannel: new Rate('errorRate_createChannel'),
    errorRate_addMember: new Rate('errorRate_addMember'),
    errorRate_sendMessage: new Rate('errorRate_sendMessage'),
    errorRate_fetchMemberships: new Rate('errorRate_fetchMemberships'),
    errorRate_fetchMembershipsWithMetadata: new Rate('errorRate_fetchMembershipsWithMetadata'),
    errorRate_fetchMessages: new Rate('errorRate_fetchMessages'),
    errorRate_fetchMessagesByTableId: new Rate('errorRate_fetchMessagesByTableId'),

};

export function recordMetric(response, metric, errorMetric) {
    const contractDuration = response.headers['X-Contract-Duration'] ? parseFloat(response.headers['X-Contract-Duration']) : 0;
    if (contractDuration > 0) {
        metric.add(contractDuration);
    } else {
        const internalDuration = response.headers['X-Internal-Duration'] ? parseFloat(response.headers['X-Internal-Duration']) : 0;
        metric.add(internalDuration);
    }
    errorMetric.add(response.status !== 200);
}