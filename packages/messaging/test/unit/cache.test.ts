// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { TimeBasedLruCache } from '../../src/cache.js';

describe('TimeBasedLruCache', () => {
	let cache: TimeBasedLruCache;
	const defaultOptions = { ttlMs: 1000, maxEntries: 3 };

	beforeEach(() => {
		cache = new TimeBasedLruCache(defaultOptions);
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('constructor', () => {
		it('should create cache with provided options', () => {
			const customCache = new TimeBasedLruCache({ ttlMs: 5000, maxEntries: 10 });
			expect(customCache).toBeInstanceOf(TimeBasedLruCache);
		});

		it('should throw error for zero ttlMs', () => {
			expect(() => new TimeBasedLruCache({ ttlMs: 0, maxEntries: 3 })).toThrow(
				'ttlMs must be greater than 0',
			);
		});

		it('should throw error for negative ttlMs', () => {
			expect(() => new TimeBasedLruCache({ ttlMs: -100, maxEntries: 3 })).toThrow(
				'ttlMs must be greater than 0',
			);
		});

		it('should throw error for zero maxEntries', () => {
			expect(() => new TimeBasedLruCache({ ttlMs: 1000, maxEntries: 0 })).toThrow(
				'maxEntries must be greater than 0',
			);
		});

		it('should throw error for negative maxEntries', () => {
			expect(() => new TimeBasedLruCache({ ttlMs: 1000, maxEntries: -5 })).toThrow(
				'maxEntries must be greater than 0',
			);
		});
	});

	describe('readSync', () => {
		it('should load and cache value on first call', () => {
			const loadFn = vi.fn(() => 'test-value');
			const result = cache.readSync(['key1'], loadFn);

			expect(result).toBe('test-value');
			expect(loadFn).toHaveBeenCalledTimes(1);
		});

		it('should return cached value on subsequent calls', () => {
			const loadFn = vi.fn(() => 'test-value');

			cache.readSync(['key1'], loadFn);
			const result = cache.readSync(['key1'], loadFn);

			expect(result).toBe('test-value');
			expect(loadFn).toHaveBeenCalledTimes(1);
		});

		it('should join multiple key parts with colon', () => {
			const loadFn = vi.fn(() => 'test-value');

			cache.readSync(['part1', 'part2', 'part3'], loadFn);
			const result = cache.readSync(['part1', 'part2', 'part3'], loadFn);

			expect(result).toBe('test-value');
			expect(loadFn).toHaveBeenCalledTimes(1);
		});

		it('should reload value after TTL expires', () => {
			const loadFn = vi.fn().mockReturnValueOnce('first-value').mockReturnValueOnce('second-value');

			cache.readSync(['key1'], loadFn);

			vi.advanceTimersByTime(1001);

			const result = cache.readSync(['key1'], loadFn);

			expect(result).toBe('second-value');
			expect(loadFn).toHaveBeenCalledTimes(2);
		});

		it('should not reload value before TTL expires', () => {
			const loadFn = vi.fn(() => 'test-value');

			cache.readSync(['key1'], loadFn);

			vi.advanceTimersByTime(999);

			const result = cache.readSync(['key1'], loadFn);

			expect(result).toBe('test-value');
			expect(loadFn).toHaveBeenCalledTimes(1);
		});

		it('should move accessed entry to end (LRU behavior)', () => {
			const loadFn1 = vi.fn(() => 'value1');
			const loadFn2 = vi.fn(() => 'value2');
			const loadFn3 = vi.fn(() => 'value3');
			const loadFn4 = vi.fn(() => 'value4');

			cache.readSync(['key1'], loadFn1);
			cache.readSync(['key2'], loadFn2);
			cache.readSync(['key3'], loadFn3);

			cache.readSync(['key1'], loadFn1);

			cache.readSync(['key4'], loadFn4);

			cache.readSync(['key2'], loadFn2);

			expect(loadFn1).toHaveBeenCalledTimes(1);
			expect(loadFn2).toHaveBeenCalledTimes(2);
			expect(loadFn3).toHaveBeenCalledTimes(1);
			expect(loadFn4).toHaveBeenCalledTimes(1);
		});

		it('should evict LRU entry when cache is full', () => {
			const loadFn1 = vi.fn(() => 'value1');
			const loadFn2 = vi.fn(() => 'value2');
			const loadFn3 = vi.fn(() => 'value3');
			const loadFn4 = vi.fn(() => 'value4');

			cache.readSync(['key1'], loadFn1);
			cache.readSync(['key2'], loadFn2);
			cache.readSync(['key3'], loadFn3);
			cache.readSync(['key4'], loadFn4);

			cache.readSync(['key1'], loadFn1);

			expect(loadFn1).toHaveBeenCalledTimes(2);
			expect(loadFn2).toHaveBeenCalledTimes(1);
			expect(loadFn3).toHaveBeenCalledTimes(1);
			expect(loadFn4).toHaveBeenCalledTimes(1);
		});

		it('should handle different data types', () => {
			const objectValue = { test: 'object' };
			const numberValue = 42;
			const arrayValue = [1, 2, 3];

			const objResult = cache.readSync(['obj'], () => objectValue);
			const numResult = cache.readSync(['num'], () => numberValue);
			const arrResult = cache.readSync(['arr'], () => arrayValue);

			expect(objResult).toEqual(objectValue);
			expect(numResult).toBe(numberValue);
			expect(arrResult).toEqual(arrayValue);
		});
	});

	describe('read (async)', () => {
		it('should handle synchronous load function', () => {
			const loadFn = vi.fn(() => 'sync-value');
			const result = cache.read(['key1'], loadFn);

			expect(result).toBe('sync-value');
			expect(loadFn).toHaveBeenCalledTimes(1);
		});

		it('should handle asynchronous load function', async () => {
			const loadFn = vi.fn(() => Promise.resolve('async-value'));
			const result = cache.read(['key1'], loadFn);

			expect(result).toBeInstanceOf(Promise);
			expect(await result).toBe('async-value');
			expect(loadFn).toHaveBeenCalledTimes(1);
		});

		it('should cache async results', async () => {
			const loadFn = vi.fn(() => Promise.resolve('async-value'));

			await cache.read(['key1'], loadFn);
			const result = cache.read(['key1'], loadFn);

			expect(result).toBe('async-value');
			expect(loadFn).toHaveBeenCalledTimes(1);
		});

		it('should handle rejected promises', async () => {
			const error = new Error('Load failed');
			const loadFn = vi.fn(() => Promise.reject(error));

			await expect(cache.read(['key1'], loadFn)).rejects.toThrow('Load failed');
			expect(loadFn).toHaveBeenCalledTimes(1);
		});

		it('should remove cache entry on promise rejection', async () => {
			const error = new Error('Load failed');
			const loadFn = vi
				.fn()
				.mockReturnValueOnce(Promise.reject(error))
				.mockReturnValueOnce(Promise.resolve('success'));

			await expect(cache.read(['key1'], loadFn)).rejects.toThrow('Load failed');

			const result = await cache.read(['key1'], loadFn);
			expect(result).toBe('success');
			expect(loadFn).toHaveBeenCalledTimes(2);
		});

		it('should handle concurrent async loads for same key', async () => {
			const mockApiCall = vi.fn(() => Promise.resolve('api-data'));

			const promise1 = cache.read(['user', '123'], mockApiCall);
			const promise2 = cache.read(['user', '123'], mockApiCall);

			const [result1, result2] = await Promise.all([promise1, promise2]);

			expect(result1).toBe('api-data');
			expect(result2).toBe('api-data');
			expect(mockApiCall).toHaveBeenCalledTimes(2);
		});
	});

	describe('clear', () => {
		it('should remove all entries from cache', () => {
			const loadFn = vi.fn(() => 'test-value');

			cache.readSync(['key1'], loadFn);
			cache.readSync(['key2'], loadFn);

			cache.clear();

			cache.readSync(['key1'], loadFn);
			cache.readSync(['key2'], loadFn);

			expect(loadFn).toHaveBeenCalledTimes(4);
		});
	});

	describe('edge cases', () => {
		it('should handle single entry cache', () => {
			const singleCache = new TimeBasedLruCache({ ttlMs: 1000, maxEntries: 1 });
			const loadFn1 = vi.fn(() => 'value1');
			const loadFn2 = vi.fn(() => 'value2');

			singleCache.readSync(['key1'], loadFn1);
			singleCache.readSync(['key2'], loadFn2);
			singleCache.readSync(['key1'], loadFn1);

			expect(loadFn1).toHaveBeenCalledTimes(2);
			expect(loadFn2).toHaveBeenCalledTimes(1);
		});

		it('should handle empty key array', () => {
			const loadFn = vi.fn(() => 'value');

			cache.readSync([''], loadFn);
			const result = cache.readSync([''], loadFn);

			expect(result).toBe('value');
			expect(loadFn).toHaveBeenCalledTimes(1);
		});

		it('should handle null and undefined values', () => {
			const nullResult = cache.readSync(['null'], () => null);
			const undefinedResult = cache.readSync(['undefined'], () => undefined);

			expect(nullResult).toBeNull();
			expect(undefinedResult).toBeUndefined();
		});

		it('should distinguish between different key combinations', () => {
			const loadFn1 = vi.fn(() => 'value1');
			const loadFn2 = vi.fn(() => 'value2');

			cache.readSync(['a', 'b'], loadFn1);
			cache.readSync(['ab'], loadFn2);
			cache.readSync(['a', 'b'], loadFn1);
			cache.readSync(['ab'], loadFn2);

			expect(loadFn1).toHaveBeenCalledTimes(1);
			expect(loadFn2).toHaveBeenCalledTimes(1);
		});
	});

	describe('performance characteristics', () => {
		it('should handle large number of entries efficiently', () => {
			const largeCache = new TimeBasedLruCache({ ttlMs: 1000, maxEntries: 1000 });
			const loadFn = vi.fn((key: string) => `value-${key}`);

			for (let i = 0; i < 1000; i++) {
				largeCache.readSync([`key${i}`], () => loadFn(`key${i}`));
			}

			for (let i = 0; i < 1000; i++) {
				largeCache.readSync([`key${i}`], () => loadFn(`key${i}`));
			}

			expect(loadFn).toHaveBeenCalledTimes(1000);
		});
	});
});
