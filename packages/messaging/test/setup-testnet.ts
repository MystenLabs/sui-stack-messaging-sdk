import { fundTestUsers } from './fund-test-users';
import { prepareTestData } from './prepare-test-data';

/**
 * Testnet Setup Script
 *
 * This script handles the complete setup for testnet testing:
 * 1. Funds test users from a main funder account
 * 2. Prepares test data (channels and messages)
 *
 * Usage:
 *   npx tsx setup-testnet.ts
 *
 * Required Environment Variables:
 *   - TESTNET_FUNDER_ADDRESS: Address of the account with testnet SUI
 *   - TESTNET_FUNDER_SECRET_KEY: Secret key of the funder account
 *   - TESTNET_PACKAGE_ID: Deployed package ID on testnet
 *   - TESTNET_SEAL_APPROVE_PACKAGE_ID: Seal approve contract package ID
 *   - TESTNET_SECRET_KEY: Secret key for the main test account
 */
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
	console.log(
		'   1. Run integration tests: TEST_ENVIRONMENT=testnet pnpm vitest integration-read-v2.test.ts',
	);
	console.log('   2. Or run all tests: pnpm test:integration:testnet');
}

// Run the script
if (require.main === module) {
	setupTestnet().catch((error) => {
		console.error('❌ Testnet setup failed:', error);
		process.exit(1);
	});
}

export { setupTestnet };
