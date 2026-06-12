// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach } from 'vitest';
import {
	LocalChannelRegistry,
	isChannelName,
	normalizeChannelName,
	formatChannelName,
	type ChannelNameResolver,
} from '../../src/utils/channelResolution.js';

describe('isChannelName', () => {
	it('detects names with # prefix', () => {
		expect(isChannelName('#general')).toBe(true);
		expect(isChannelName('#random')).toBe(true);
		expect(isChannelName('#my-channel')).toBe(true);
		expect(isChannelName('#123')).toBe(true);
	});

	it('detects names without # prefix (not starting with 0x)', () => {
		expect(isChannelName('general')).toBe(true);
		expect(isChannelName('random')).toBe(true);
		expect(isChannelName('my-channel')).toBe(true);
	});

	it('rejects addresses (starting with 0x)', () => {
		expect(isChannelName('0x123')).toBe(false);
		expect(isChannelName('0xabcdef1234567890')).toBe(false);
		expect(isChannelName('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')).toBe(
			false,
		);
	});

	it('rejects empty strings', () => {
		expect(isChannelName('')).toBe(false);
	});
});

describe('normalizeChannelName', () => {
	it('removes # prefix', () => {
		expect(normalizeChannelName('#general')).toBe('general');
		expect(normalizeChannelName('#RANDOM')).toBe('random');
	});

	it('converts to lowercase', () => {
		expect(normalizeChannelName('General')).toBe('general');
		expect(normalizeChannelName('RANDOM')).toBe('random');
		expect(normalizeChannelName('#MyChannel')).toBe('mychannel');
	});

	it('trims whitespace', () => {
		expect(normalizeChannelName('  general  ')).toBe('general');
		expect(normalizeChannelName('  #random  ')).toBe('random');
	});

	it('handles already normalized names', () => {
		expect(normalizeChannelName('general')).toBe('general');
		expect(normalizeChannelName('random')).toBe('random');
	});
});

describe('formatChannelName', () => {
	it('adds # prefix', () => {
		expect(formatChannelName('general')).toBe('#general');
		expect(formatChannelName('random')).toBe('#random');
	});

	it('normalizes and adds prefix', () => {
		expect(formatChannelName('GENERAL')).toBe('#general');
		expect(formatChannelName('#Random')).toBe('#random');
		expect(formatChannelName('  #MyChannel  ')).toBe('#mychannel');
	});
});

describe('LocalChannelRegistry', () => {
	let registry: LocalChannelRegistry;

	beforeEach(() => {
		registry = new LocalChannelRegistry();
	});

	describe('constructor', () => {
		it('creates empty registry', () => {
			expect(registry.size).toBe(0);
		});

		it('initializes with Record mappings', () => {
			const initialRegistry = new LocalChannelRegistry({
				general: '0xchannel1',
				random: '0xchannel2',
			});
			expect(initialRegistry.size).toBe(2);
		});

		it('initializes with Map mappings', () => {
			const map = new Map([
				['general', '0xchannel1'],
				['random', '0xchannel2'],
			]);
			const initialRegistry = new LocalChannelRegistry(map);
			expect(initialRegistry.size).toBe(2);
		});

		it('normalizes names during initialization', async () => {
			const initialRegistry = new LocalChannelRegistry({
				'#General': '0xchannel1',
				RANDOM: '0xchannel2',
			});
			expect(await initialRegistry.resolve('#general')).toBe('0xchannel1');
			expect(await initialRegistry.resolve('random')).toBe('0xchannel2');
		});
	});

	describe('resolve', () => {
		beforeEach(async () => {
			await registry.register('general', '0xchannel1');
			await registry.register('random', '0xchannel2');
		});

		it('resolves registered channel names', async () => {
			expect(await registry.resolve('#general')).toBe('0xchannel1');
			expect(await registry.resolve('general')).toBe('0xchannel1');
			expect(await registry.resolve('#random')).toBe('0xchannel2');
		});

		it('resolves case-insensitively', async () => {
			expect(await registry.resolve('#GENERAL')).toBe('0xchannel1');
			expect(await registry.resolve('General')).toBe('0xchannel1');
			expect(await registry.resolve('#RaNdOm')).toBe('0xchannel2');
		});

		it('passes through channel IDs unchanged', async () => {
			expect(await registry.resolve('0xchannel1')).toBe('0xchannel1');
			expect(await registry.resolve('0xunknown')).toBe('0xunknown');
		});

		it('throws for unregistered names', async () => {
			await expect(registry.resolve('#unknown')).rejects.toThrow('Channel name not found: #unknown');
			await expect(registry.resolve('notfound')).rejects.toThrow(
				'Channel name not found: #notfound',
			);
		});
	});

	describe('resolveMany', () => {
		beforeEach(async () => {
			await registry.register('general', '0xchannel1');
			await registry.register('random', '0xchannel2');
		});

		it('resolves multiple names', async () => {
			const result = await registry.resolveMany(['#general', '#random']);
			expect(result).toEqual(['0xchannel1', '0xchannel2']);
		});

		it('resolves mixed names and IDs', async () => {
			const result = await registry.resolveMany(['#general', '0xother', 'random']);
			expect(result).toEqual(['0xchannel1', '0xother', '0xchannel2']);
		});

		it('resolves empty array', async () => {
			const result = await registry.resolveMany([]);
			expect(result).toEqual([]);
		});

		it('throws if any name is not found', async () => {
			await expect(registry.resolveMany(['#general', '#unknown'])).rejects.toThrow(
				'Channel name not found: #unknown',
			);
		});
	});

	describe('reverseLookup', () => {
		beforeEach(async () => {
			await registry.register('general', '0xchannel1');
		});

		it('returns channel name for registered ID', async () => {
			expect(await registry.reverseLookup('0xchannel1')).toBe('#general');
		});

		it('returns null for unregistered ID', async () => {
			expect(await registry.reverseLookup('0xunknown')).toBeNull();
		});
	});

	describe('register', () => {
		it('registers new channel name', async () => {
			await registry.register('general', '0xchannel1');
			expect(await registry.resolve('#general')).toBe('0xchannel1');
		});

		it('normalizes channel name', async () => {
			await registry.register('#GENERAL', '0xchannel1');
			expect(await registry.resolve('general')).toBe('0xchannel1');
		});

		it('allows updating same name to same channel', async () => {
			await registry.register('general', '0xchannel1');
			await registry.register('general', '0xchannel1'); // Should not throw
			expect(await registry.resolve('#general')).toBe('0xchannel1');
		});

		it('throws when name is already registered to different channel', async () => {
			await registry.register('general', '0xchannel1');
			await expect(registry.register('general', '0xchannel2')).rejects.toThrow(
				'Channel name #general is already registered to 0xchannel1',
			);
		});

		it('replaces name when channel ID gets new name', async () => {
			await registry.register('general', '0xchannel1');
			await registry.register('main', '0xchannel1'); // Same channel, new name
			expect(await registry.reverseLookup('0xchannel1')).toBe('#main');
			await expect(registry.resolve('#general')).rejects.toThrow();
		});
	});

	describe('unregister', () => {
		beforeEach(async () => {
			await registry.register('general', '0xchannel1');
		});

		it('removes registered channel name', async () => {
			await registry.unregister('general');
			await expect(registry.resolve('#general')).rejects.toThrow();
		});

		it('removes reverse lookup', async () => {
			await registry.unregister('general');
			expect(await registry.reverseLookup('0xchannel1')).toBeNull();
		});

		it('handles unregistering non-existent name', async () => {
			await registry.unregister('unknown'); // Should not throw
		});

		it('normalizes name before unregistering', async () => {
			await registry.unregister('#GENERAL');
			await expect(registry.resolve('general')).rejects.toThrow();
		});
	});

	describe('list', () => {
		it('returns empty map for empty registry', async () => {
			const result = await registry.list();
			expect(result.size).toBe(0);
		});

		it('returns all registered names', async () => {
			await registry.register('general', '0xchannel1');
			await registry.register('random', '0xchannel2');
			const result = await registry.list();
			expect(result.size).toBe(2);
			expect(result.get('#general')).toBe('0xchannel1');
			expect(result.get('#random')).toBe('0xchannel2');
		});
	});

	describe('export/import', () => {
		it('exports registry data', async () => {
			await registry.register('general', '0xchannel1');
			await registry.register('random', '0xchannel2');
			const exported = registry.export();
			expect(exported).toEqual({
				general: '0xchannel1',
				random: '0xchannel2',
			});
		});

		it('imports registry data (merge)', async () => {
			await registry.register('general', '0xchannel1');
			registry.import({ random: '0xchannel2' }, true);
			expect(await registry.resolve('#general')).toBe('0xchannel1');
			expect(await registry.resolve('#random')).toBe('0xchannel2');
		});

		it('imports registry data (replace)', async () => {
			await registry.register('general', '0xchannel1');
			registry.import({ random: '0xchannel2' }, false);
			await expect(registry.resolve('#general')).rejects.toThrow();
			expect(await registry.resolve('#random')).toBe('0xchannel2');
		});
	});

	describe('clear', () => {
		it('removes all registrations', async () => {
			await registry.register('general', '0xchannel1');
			await registry.register('random', '0xchannel2');
			registry.clear();
			expect(registry.size).toBe(0);
			await expect(registry.resolve('#general')).rejects.toThrow();
		});
	});
});

describe('ChannelNameResolver interface', () => {
	it('can create a custom implementation', async () => {
		// Example of custom resolver (e.g., on-chain registry)
		const customResolver: ChannelNameResolver = {
			resolve: async (nameOrId) => {
				if (nameOrId === '#test') {
					return '0xcustom_resolved';
				}
				if (nameOrId.startsWith('0x')) {
					return nameOrId;
				}
				throw new Error(`Unknown channel: ${nameOrId}`);
			},
			resolveMany: async (inputs) => {
				return Promise.all(inputs.map((input) => customResolver.resolve(input)));
			},
			reverseLookup: async (channelId) => {
				if (channelId === '0xcustom_resolved') {
					return '#test';
				}
				return null;
			},
			register: async () => {
				throw new Error('Registration not supported');
			},
			unregister: async () => {
				throw new Error('Unregistration not supported');
			},
			list: async () => new Map([['#test', '0xcustom_resolved']]),
		};

		expect(await customResolver.resolve('#test')).toBe('0xcustom_resolved');
		expect(await customResolver.resolve('0xpassthrough')).toBe('0xpassthrough');
		expect(await customResolver.reverseLookup('0xcustom_resolved')).toBe('#test');
	});
});
