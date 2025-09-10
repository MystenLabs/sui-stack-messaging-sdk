#!/bin/bash

# Example script for setting up testnet testing
# Replace the values below with your actual testnet configuration

echo "🚀 Setting up testnet testing environment..."

# Set your testnet configuration
export TESTNET_FUNDER_ADDRESS="0xYOUR_FUNDED_ADDRESS_HERE"
export TESTNET_FUNDER_SECRET_KEY="your funder secret key here"
export TESTNET_PACKAGE_ID="0xYOUR_PACKAGE_ID_HERE"
export TESTNET_SEAL_APPROVE_PACKAGE_ID="0xYOUR_SEAL_APPROVE_PACKAGE_ID_HERE"
export TESTNET_SECRET_KEY="your main test account secret key here"
export TEST_ENVIRONMENT="testnet"

# Verify required environment variables are set
if [ -z "$TESTNET_FUNDER_ADDRESS" ] || [ "$TESTNET_FUNDER_ADDRESS" = "0xYOUR_FUNDED_ADDRESS_HERE" ]; then
    echo "❌ Please set TESTNET_FUNDER_ADDRESS to your funded testnet address"
    exit 1
fi

if [ -z "$TESTNET_FUNDER_SECRET_KEY" ] || [ "$TESTNET_FUNDER_SECRET_KEY" = "your funder secret key here" ]; then
    echo "❌ Please set TESTNET_FUNDER_SECRET_KEY to your funder's secret key"
    exit 1
fi

if [ -z "$TESTNET_PACKAGE_ID" ] || [ "$TESTNET_PACKAGE_ID" = "0xYOUR_PACKAGE_ID_HERE" ]; then
    echo "❌ Please set TESTNET_PACKAGE_ID to your deployed package ID"
    exit 1
fi

if [ -z "$TESTNET_SEAL_APPROVE_PACKAGE_ID" ] || [ "$TESTNET_SEAL_APPROVE_PACKAGE_ID" = "0xYOUR_SEAL_APPROVE_PACKAGE_ID_HERE" ]; then
    echo "❌ Please set TESTNET_SEAL_APPROVE_PACKAGE_ID to your seal approve package ID"
    exit 1
fi

if [ -z "$TESTNET_SECRET_KEY" ] || [ "$TESTNET_SECRET_KEY" = "your main test account secret key here" ]; then
    echo "❌ Please set TESTNET_SECRET_KEY to your main test account secret key"
    exit 1
fi

echo "✅ Environment variables configured"

# Run the complete testnet setup
echo "📋 Running testnet setup..."
npx tsx setup-testnet.ts

if [ $? -eq 0 ]; then
    echo "✅ Testnet setup completed successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Run integration tests: TEST_ENVIRONMENT=testnet pnpm vitest integration-read-v2.test.ts"
    echo "   2. Or run all tests: pnpm test:integration:testnet "
else
    echo "❌ Testnet setup failed"
    exit 1
fi
