#!/usr/bin/env tsx

/**
 * Testnet Setup Script
 *
 * This script handles the complete setup for testnet testing:
 * 1. Funds test users from a main funder account
 * 2. Prepares test data (channels and messages)
 *
 * Usage:
 *   npx tsx test/setup-testnet.ts
 *
 * Required Environment Variables:
 *   - TESTNET_FUNDER_ADDRESS: Address of the account with testnet SUI
 *   - TESTNET_FUNDER_PHRASE: Recovery phrase of the funder account
 *   - TESTNET_PACKAGE_ID: Deployed package ID on testnet
 *   - TESTNET_SEAL_APPROVE_PACKAGE_ID: Seal approve contract package ID
 *   - PHRASE: Recovery phrase for the main test account
 */

import { fundTestUsers } from './fund-test-users';
import { prepareTestData } from './prepare-test-data';

async function setupTestnet(): Promise<void> {
	console.log('🚀 Starting testnet setup...');

	// Step 1: Fund test users
	console.log('\n📋 Step 1: Funding test users...');
	await fundTestUsers();

	// Step 2: Prepare test data
	console.log('\n📋 Step 2: Preparing test data...');
	await prepareTestData();

	console.log('\n✅ Testnet setup completed successfully!');
	console.log('\n📝 Next steps:');
	console.log('   1. Run integration tests: npm test integration-read-v2.test.ts');
	console.log('   2. Or run all tests: npm test');
}

// Run the script
if (require.main === module) {
	setupTestnet().catch((error) => {
		console.error('❌ Testnet setup failed:', error);
		process.exit(1);
	});
}

export { setupTestnet };
