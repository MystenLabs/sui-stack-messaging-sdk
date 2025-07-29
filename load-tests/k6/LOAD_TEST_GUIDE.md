# Load Test Guide - Connection Reset Fixes

## Problem

The original load test was experiencing connection reset errors (`read: connection reset by peer` and `EOF`) due to:

- High concurrent load (1250 VUs)
- Slow blockchain operations (Sui transactions)
- Default server configuration not optimized for high load
- No timeout or retry handling

## Improvements Made

### 1. Server Configuration (`load-tests/backend/users-provisioning/src/index.ts`)

- Increased `maxConnections` to 2000
- Added `requestTimeout` of 30 seconds for blockchain operations
- Configured keep-alive settings to prevent premature connection drops

### 2. Request Timeout Middleware (`load-tests/backend/users-provisioning/src/features/contract/contractRoutes.ts`)

- Added 25-second timeout for blockchain operations
- Better error handling with detailed error messages
- Graceful timeout responses (408 status)

### 3. k6 Configuration (`load-tests/k6/config.js` & `load-tests/k6/main.js`)

- Added HTTP client configuration with timeouts
- Enabled connection reuse
- Added retry logic for connection resets

### 4. Retry Logic (`load-tests/k6/scenarios.js`)

- Automatic retry for connection reset errors
- Configurable retry attempts and delays
- Better error handling in HTTP requests

## Testing Strategy

### Step 1: Test Basic Connectivity

```bash
# Test with a simple load test first
k6 run load-tests/k6/test-load.js
```

### Step 2: Gradual Load Increase

Start with smaller numbers and gradually increase:

```bash
# Test with 50 active + 200 passive users
ACTIVE_USERS_TOTAL=50 PASSIVE_USERS_TOTAL=200 DURATION=30s k6 run load-tests/k6/main.js

# Test with 100 active + 400 passive users
ACTIVE_USERS_TOTAL=100 PASSIVE_USERS_TOTAL=400 DURATION=30s k6 run load-tests/k6/main.js

# Test with 250 active + 1000 passive users
ACTIVE_USERS_TOTAL=250 PASSIVE_USERS_TOTAL=1000 DURATION=1m k6 run load-tests/k6/main.js
```

### Step 3: Monitor Server Resources

While running load tests, monitor:

```bash
# Monitor server CPU and memory
top -p $(pgrep -f "node.*index.ts")

# Monitor network connections
netstat -an | grep :4321 | wc -l

# Monitor server logs for timeouts
tail -f /path/to/server/logs
```

## Environment Variables

Key environment variables for load testing:

```bash
# Load test configuration
ACTIVE_USERS_TOTAL=250          # Number of active users sending messages
PASSIVE_USERS_TOTAL=1000        # Number of passive users polling
DURATION=1m                     # Test duration
ACTIVE_USERS_THINK_TIME_SEC_MIN=4   # Min time between messages
ACTIVE_USERS_THINK_TIME_SEC_MAX=10  # Max time between messages
PASSIVE_USERS_POLLING_INTERVAL=2    # Polling interval for passive users

# Backend configuration
PROVISIONING_API_URL=http://localhost:4321
PORT=4321                        # Backend port
```

## Troubleshooting

### Connection Reset Errors Still Occurring?

1. **Check server resources:**

   ```bash
   # Monitor CPU usage
   htop

   # Check available memory
   free -h
   ```

2. **Reduce load gradually:**

   - Start with 50 active + 200 passive users
   - Increase by 50% each time
   - Monitor error rates

3. **Check Sui network performance:**

   - Blockchain operations may be slow during network congestion
   - Consider using a local Sui node for testing

4. **Adjust timeouts:**
   - Increase `requestTimeout` in server config if needed
   - Increase `httpRequestTimeout` in k6 config

### Performance Optimization Tips

1. **Database optimization:**

   - Ensure database indexes are properly set
   - Monitor database connection pool

2. **Network optimization:**

   - Use localhost for testing to eliminate network latency
   - Consider using a local Sui node

3. **Application optimization:**
   - Implement connection pooling for Sui client
   - Add caching for frequently accessed data
   - Consider async processing for non-critical operations

## Expected Results

With the improvements, you should see:

- Significantly fewer connection reset errors
- Better error handling with meaningful error messages
- Automatic retries for transient connection issues
- More stable performance under load

## Monitoring Metrics

Key metrics to monitor:

- `http_req_failed` rate (should be < 1%)
- `http_req_duration` p95 (should be < 5s for most requests)
- Connection reset error frequency
- Server resource usage (CPU, memory, connections)
