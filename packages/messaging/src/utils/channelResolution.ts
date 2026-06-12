// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Interface for channel name resolution.
 * Implementations can resolve human-readable channel names (e.g., "#general")
 * to channel object IDs and perform reverse lookups.
 */
export interface ChannelNameResolver {
	/**
	 * Resolve a channel name or ID to a channel object ID.
	 * If the input is already a valid channel ID (0x...), return it unchanged.
	 * If the input is a channel name (e.g., "#general"), resolve it to a channel ID.
	 * @param nameOrId - A channel name (with or without #) or channel object ID
	 * @returns The resolved channel object ID
	 * @throws Error if the name cannot be resolved
	 */
	resolve(nameOrId: string): Promise<string>;

	/**
	 * Resolve multiple channel names or IDs to channel object IDs.
	 * @param namesOrIds - Array of channel names or channel object IDs
	 * @returns Array of resolved channel object IDs in the same order
	 * @throws Error if any name cannot be resolved
	 */
	resolveMany(namesOrIds: string[]): Promise<string[]>;

	/**
	 * Perform a reverse lookup to get the channel name for a channel ID.
	 * @param channelId - A channel object ID
	 * @returns The channel name or null if not found/registered
	 */
	reverseLookup(channelId: string): Promise<string | null>;

	/**
	 * Register a channel name mapping.
	 * @param name - The human-readable channel name (with or without #)
	 * @param channelId - The channel object ID
	 */
	register(name: string, channelId: string): Promise<void>;

	/**
	 * Unregister a channel name mapping.
	 * @param name - The channel name to unregister
	 */
	unregister(name: string): Promise<void>;

	/**
	 * List all registered channel name mappings.
	 * @returns Map of channel names to channel IDs
	 */
	list(): Promise<Map<string, string>>;
}

/**
 * Check if a string is a channel name (starts with # or doesn't start with 0x).
 * @param input - The string to check
 * @returns True if the input appears to be a channel name
 */
export function isChannelName(input: string): boolean {
	if (!input || input.length === 0) {
		return false;
	}
	// Explicit channel name prefix
	if (input.startsWith('#')) {
		return true;
	}
	// If it looks like an address/ID (starts with 0x), it's not a name
	if (input.startsWith('0x')) {
		return false;
	}
	// Otherwise, treat as a name (e.g., "general" without #)
	return true;
}

/**
 * Normalize a channel name by removing the # prefix if present and converting to lowercase.
 * @param name - The channel name to normalize
 * @returns The normalized channel name
 */
export function normalizeChannelName(name: string): string {
	let normalized = name.trim().toLowerCase();
	if (normalized.startsWith('#')) {
		normalized = normalized.slice(1);
	}
	return normalized;
}

/**
 * Format a channel name with the # prefix.
 * @param name - The channel name (with or without #)
 * @returns The formatted channel name with # prefix
 */
export function formatChannelName(name: string): string {
	const normalized = normalizeChannelName(name);
	return `#${normalized}`;
}

/**
 * In-memory channel name registry implementation.
 * Useful for local development, testing, and single-session usage.
 * Names are stored in memory and lost when the process exits.
 */
export class LocalChannelRegistry implements ChannelNameResolver {
	#nameToId: Map<string, string> = new Map();
	#idToName: Map<string, string> = new Map();

	/**
	 * Create a new LocalChannelRegistry with optional initial mappings.
	 * @param initialMappings - Optional initial name-to-ID mappings
	 */
	constructor(initialMappings?: Record<string, string> | Map<string, string>) {
		if (initialMappings) {
			const entries =
				initialMappings instanceof Map
					? initialMappings.entries()
					: Object.entries(initialMappings);
			for (const [name, channelId] of entries) {
				const normalized = normalizeChannelName(name);
				this.#nameToId.set(normalized, channelId);
				this.#idToName.set(channelId, normalized);
			}
		}
	}

	async resolve(nameOrId: string): Promise<string> {
		// If it's not a channel name, assume it's already an ID
		if (!isChannelName(nameOrId)) {
			return nameOrId;
		}

		const normalized = normalizeChannelName(nameOrId);
		const channelId = this.#nameToId.get(normalized);

		if (!channelId) {
			throw new Error(`Channel name not found: ${formatChannelName(nameOrId)}`);
		}

		return channelId;
	}

	async resolveMany(namesOrIds: string[]): Promise<string[]> {
		return Promise.all(namesOrIds.map((nameOrId) => this.resolve(nameOrId)));
	}

	async reverseLookup(channelId: string): Promise<string | null> {
		const name = this.#idToName.get(channelId);
		return name ? formatChannelName(name) : null;
	}

	async register(name: string, channelId: string): Promise<void> {
		const normalized = normalizeChannelName(name);

		// Check if name is already registered to a different channel
		const existingId = this.#nameToId.get(normalized);
		if (existingId && existingId !== channelId) {
			throw new Error(
				`Channel name ${formatChannelName(name)} is already registered to ${existingId}`,
			);
		}

		// Remove any existing name for this channel ID
		const existingName = this.#idToName.get(channelId);
		if (existingName && existingName !== normalized) {
			this.#nameToId.delete(existingName);
		}

		this.#nameToId.set(normalized, channelId);
		this.#idToName.set(channelId, normalized);
	}

	async unregister(name: string): Promise<void> {
		const normalized = normalizeChannelName(name);
		const channelId = this.#nameToId.get(normalized);

		if (channelId) {
			this.#nameToId.delete(normalized);
			this.#idToName.delete(channelId);
		}
	}

	async list(): Promise<Map<string, string>> {
		const result = new Map<string, string>();
		for (const [name, channelId] of this.#nameToId) {
			result.set(formatChannelName(name), channelId);
		}
		return result;
	}

	/**
	 * Export the registry data for persistence.
	 * @returns JSON-serializable object of name-to-ID mappings
	 */
	export(): Record<string, string> {
		const result: Record<string, string> = {};
		for (const [name, channelId] of this.#nameToId) {
			result[name] = channelId;
		}
		return result;
	}

	/**
	 * Import registry data from a previously exported object.
	 * @param data - The exported registry data
	 * @param merge - If true, merge with existing data; if false, replace
	 */
	import(data: Record<string, string>, merge: boolean = true): void {
		if (!merge) {
			this.#nameToId.clear();
			this.#idToName.clear();
		}

		for (const [name, channelId] of Object.entries(data)) {
			const normalized = normalizeChannelName(name);
			this.#nameToId.set(normalized, channelId);
			this.#idToName.set(channelId, normalized);
		}
	}

	/**
	 * Clear all registered channel names.
	 */
	clear(): void {
		this.#nameToId.clear();
		this.#idToName.clear();
	}

	/**
	 * Get the number of registered channel names.
	 */
	get size(): number {
		return this.#nameToId.size;
	}
}

/**
 * Persistent channel name registry that stores mappings in localStorage (browser)
 * or a file (Node.js). Extends LocalChannelRegistry with persistence.
 */
export class PersistentChannelRegistry extends LocalChannelRegistry {
	#storageKey: string;
	#storage: Storage | null;

	/**
	 * Create a new PersistentChannelRegistry.
	 * @param storageKey - The key to use for storage (default: 'sui-messaging-channels')
	 */
	constructor(storageKey: string = 'sui-messaging-channels') {
		// Try to load existing data from localStorage
		let initialData: Record<string, string> | undefined;

		// Check if localStorage is available (browser environment)
		const storage = typeof localStorage !== 'undefined' ? localStorage : null;

		if (storage) {
			try {
				const stored = storage.getItem(storageKey);
				if (stored) {
					initialData = JSON.parse(stored);
				}
			} catch {
				// Ignore parse errors, start fresh
			}
		}

		super(initialData);
		this.#storageKey = storageKey;
		this.#storage = storage;
	}

	async register(name: string, channelId: string): Promise<void> {
		await super.register(name, channelId);
		this.#persist();
	}

	async unregister(name: string): Promise<void> {
		await super.unregister(name);
		this.#persist();
	}

	#persist(): void {
		if (this.#storage) {
			try {
				this.#storage.setItem(this.#storageKey, JSON.stringify(this.export()));
			} catch {
				// Ignore storage errors (e.g., quota exceeded)
			}
		}
	}

	/**
	 * Force a save to storage.
	 */
	save(): void {
		this.#persist();
	}

	/**
	 * Reload data from storage, discarding any unsaved changes.
	 */
	reload(): void {
		if (this.#storage) {
			try {
				const stored = this.#storage.getItem(this.#storageKey);
				if (stored) {
					this.import(JSON.parse(stored), false);
				}
			} catch {
				// Ignore parse errors
			}
		}
	}
}
