// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	SuiNSResolver,
	isSuiNSName,
	type AddressResolver,
} from '../../src/utils/addressResolution.js';

describe('isSuiNSName', () => {
	it('detects .sui names (lowercase)', () => {
		expect(isSuiNSName('alice.sui')).toBe(true);
		expect(isSuiNSName('bob.sui')).toBe(true);
		expect(isSuiNSName('my-name.sui')).toBe(true);
	});

	it('detects .sui names (case insensitive)', () => {
		expect(isSuiNSName('ALICE.SUI')).toBe(true);
		expect(isSuiNSName('Alice.Sui')).toBe(true);
		expect(isSuiNSName('BOB.sui')).toBe(true);
	});

	it('detects subdomains', () => {
		expect(isSuiNSName('sub.alice.sui')).toBe(true);
		expect(isSuiNSName('deep.sub.alice.sui')).toBe(true);
	});

	it('rejects non-.sui strings', () => {
		expect(isSuiNSName('0x1234567890abcdef')).toBe(false);
		expect(isSuiNSName('alice.eth')).toBe(false);
		expect(isSuiNSName('alice.sol')).toBe(false);
		expect(isSuiNSName('alice')).toBe(false);
		expect(isSuiNSName('')).toBe(false);
		expect(isSuiNSName('.sui')).toBe(true); // Edge case: technically ends with .sui
	});

	it('rejects addresses that happen to contain sui', () => {
		expect(isSuiNSName('0xsui1234')).toBe(false);
		expect(isSuiNSName('suiaddress')).toBe(false);
	});
});

describe('SuiNSResolver', () => {
	let mockSuinsClient: {
		getNameRecord: ReturnType<typeof vi.fn>;
	};
	let resolver: SuiNSResolver;

	beforeEach(() => {
		mockSuinsClient = {
			getNameRecord: vi.fn(),
		};
		resolver = new SuiNSResolver(mockSuinsClient as any);
	});

	describe('resolve', () => {
		it('passes through addresses unchanged', async () => {
			const address = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

			const result = await resolver.resolve(address);

			expect(result).toBe(address);
			expect(mockSuinsClient.getNameRecord).not.toHaveBeenCalled();
		});

		it('passes through short addresses', async () => {
			const address = '0x2';

			const result = await resolver.resolve(address);

			expect(result).toBe(address);
			expect(mockSuinsClient.getNameRecord).not.toHaveBeenCalled();
		});

		it('resolves SuiNS names to addresses', async () => {
			const expectedAddress = '0xresolvedaddress123';
			mockSuinsClient.getNameRecord.mockResolvedValue({
				targetAddress: expectedAddress,
			});

			const result = await resolver.resolve('alice.sui');

			expect(result).toBe(expectedAddress);
			expect(mockSuinsClient.getNameRecord).toHaveBeenCalledWith('alice.sui');
		});

		it('resolves subdomain names', async () => {
			const expectedAddress = '0xsubdomainaddress';
			mockSuinsClient.getNameRecord.mockResolvedValue({
				targetAddress: expectedAddress,
			});

			const result = await resolver.resolve('treasury.dao.sui');

			expect(result).toBe(expectedAddress);
			expect(mockSuinsClient.getNameRecord).toHaveBeenCalledWith('treasury.dao.sui');
		});

		it('throws on null record', async () => {
			mockSuinsClient.getNameRecord.mockResolvedValue(null);

			await expect(resolver.resolve('nonexistent.sui')).rejects.toThrow(
				'Failed to resolve SuiNS name: nonexistent.sui',
			);
		});

		it('throws on record without targetAddress', async () => {
			mockSuinsClient.getNameRecord.mockResolvedValue({
				targetAddress: null,
			});

			await expect(resolver.resolve('notarget.sui')).rejects.toThrow(
				'Failed to resolve SuiNS name: notarget.sui',
			);
		});

		it('throws on undefined targetAddress', async () => {
			mockSuinsClient.getNameRecord.mockResolvedValue({});

			await expect(resolver.resolve('undefined.sui')).rejects.toThrow(
				'Failed to resolve SuiNS name: undefined.sui',
			);
		});
	});

	describe('resolveMany', () => {
		it('resolves empty array', async () => {
			const result = await resolver.resolveMany([]);

			expect(result).toEqual([]);
			expect(mockSuinsClient.getNameRecord).not.toHaveBeenCalled();
		});

		it('resolves array of addresses (no SuiNS calls)', async () => {
			const addresses = ['0xabc', '0xdef', '0x123'];

			const result = await resolver.resolveMany(addresses);

			expect(result).toEqual(addresses);
			expect(mockSuinsClient.getNameRecord).not.toHaveBeenCalled();
		});

		it('resolves array of SuiNS names', async () => {
			mockSuinsClient.getNameRecord
				.mockResolvedValueOnce({ targetAddress: '0xalice' })
				.mockResolvedValueOnce({ targetAddress: '0xbob' })
				.mockResolvedValueOnce({ targetAddress: '0xcharlie' });

			const result = await resolver.resolveMany(['alice.sui', 'bob.sui', 'charlie.sui']);

			expect(result).toEqual(['0xalice', '0xbob', '0xcharlie']);
			expect(mockSuinsClient.getNameRecord).toHaveBeenCalledTimes(3);
		});

		it('resolves mixed array (names and addresses)', async () => {
			mockSuinsClient.getNameRecord
				.mockResolvedValueOnce({ targetAddress: '0xalice' })
				.mockResolvedValueOnce({ targetAddress: '0xcharlie' });

			const result = await resolver.resolveMany([
				'alice.sui',
				'0xbob_address',
				'charlie.sui',
				'0xdave_address',
			]);

			expect(result).toEqual(['0xalice', '0xbob_address', '0xcharlie', '0xdave_address']);
			expect(mockSuinsClient.getNameRecord).toHaveBeenCalledTimes(2);
			expect(mockSuinsClient.getNameRecord).toHaveBeenCalledWith('alice.sui');
			expect(mockSuinsClient.getNameRecord).toHaveBeenCalledWith('charlie.sui');
		});

		it('preserves order in mixed array', async () => {
			mockSuinsClient.getNameRecord.mockResolvedValueOnce({ targetAddress: '0xresolved' });

			const result = await resolver.resolveMany(['0xfirst', 'middle.sui', '0xlast']);

			expect(result).toEqual(['0xfirst', '0xresolved', '0xlast']);
		});

		it('throws if any name fails to resolve', async () => {
			mockSuinsClient.getNameRecord
				.mockResolvedValueOnce({ targetAddress: '0xalice' })
				.mockResolvedValueOnce(null); // Second name fails

			await expect(resolver.resolveMany(['alice.sui', 'fails.sui'])).rejects.toThrow(
				'Failed to resolve SuiNS name: fails.sui',
			);
		});
	});

	describe('reverseLookup', () => {
		it('returns null (not implemented)', async () => {
			const result = await resolver.reverseLookup('0x123');

			expect(result).toBeNull();
		});

		it('returns null for any address', async () => {
			const result = await resolver.reverseLookup(
				'0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
			);

			expect(result).toBeNull();
		});
	});
});

describe('AddressResolver interface', () => {
	it('can create a custom implementation', async () => {
		// Example of custom resolver (e.g., for testing or alternative naming systems)
		const customResolver: AddressResolver = {
			resolve: async (nameOrAddress) => {
				if (nameOrAddress === 'test.custom') {
					return '0xcustom_resolved';
				}
				return nameOrAddress;
			},
			resolveMany: async (inputs) => {
				return Promise.all(inputs.map((input) => customResolver.resolve(input)));
			},
			reverseLookup: async () => null,
		};

		expect(await customResolver.resolve('test.custom')).toBe('0xcustom_resolved');
		expect(await customResolver.resolve('0xpassthrough')).toBe('0xpassthrough');
		expect(await customResolver.resolveMany(['test.custom', '0xaddr'])).toEqual([
			'0xcustom_resolved',
			'0xaddr',
		]);
	});
});
