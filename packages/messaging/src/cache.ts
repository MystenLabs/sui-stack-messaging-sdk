// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export interface TimeBasedLruCacheOptions {
	/** The time-to-live for a cache entry in milliseconds*/
	ttlMs: number;
	/** The maximum number of entries to store in the cache */
	maxEntries: number;
}

export class TimeBasedLruCache {
	#cache: Map<string, { value: unknown; timestampMs: number }>;
	#ttlMs: number;
	#maxEntries: number;

	constructor({ ttlMs, maxEntries }: TimeBasedLruCacheOptions) {
		this.#cache = new Map();
		this.#ttlMs = ttlMs;
		this.#maxEntries = maxEntries;
	}

	/**
	 * Retrieves a value from the cache, or loads it if it doesn't exist or is expired
	 * @param key The cache key.
	 * @param load A function to load the value if not found or expired.
	 * @returns The cached or loaded value.
	 */
	read<T>(key: [string, ...string[]], load: () => T | Promise<T>): T | Promise<T> {
		const cacheKey = key.join(':');
		const entry = this.#cache.get(cacheKey);

		// Check if entry is present and not expired
		if (entry && Date.now() - entry.timestampMs <= this.#ttlMs) {
			// Note: JavaScript Map maintains insertion order, so doing the following
			// ensures the entry is moved to the end of the map
			this.#cache.delete(cacheKey);
			this.#cache.set(cacheKey, entry);
			return entry.value as T;
		}
		// The entry is either expired or doesn't exist in the cache
		const result = load();

		if (typeof result === 'object' && result !== null && 'then' in result) {
			return Promise.resolve(result)
				.then((v) => {
					this.#set(cacheKey, v);
					return v as T;
				})
				.catch((err) => {
					this.#cache.delete(cacheKey);
					throw err;
				});
		}
		this.#set(cacheKey, result);

		return result as T;
	}

	readSync<T>(key: [string, ...string[]], load: () => T): T {
		const cacheKey = key.join(':');
		const entry = this.#cache.get(cacheKey);

		if (entry && Date.now() - entry.timestampMs <= this.#ttlMs) {
			this.#cache.delete(cacheKey);
			this.#cache.set(cacheKey, entry);
			return entry.value as T;
		}

		// The entry is either expired or doesn't exist in the cache
		const result = load();
		this.#set(cacheKey, result);
		return result as T;
	}

	#set(cacheKey: string, value: unknown): void {
		// If cache is full, evict the Least Recently Used entry
		if (this.#cache.size >= this.#maxEntries) {
			// JavaScript Map maintains insertion order, so the first entry is the least recently used
			const lruKey = this.#cache.keys().next().value;
			if (lruKey !== undefined) {
				this.#cache.delete(lruKey);
			}
		}
		this.#cache.set(cacheKey, { value, timestampMs: Date.now() });
	}

	/**
	 * Clears all entries from the cache
	 */
	clear(): void {
		this.#cache.clear();
	}
}
