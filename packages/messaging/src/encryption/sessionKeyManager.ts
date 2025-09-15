// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SessionKey } from '@mysten/seal';
import type { MessagingCompatibleClient } from '../types.js';
import type { SealApproveContract, SessionKeyConfig } from './types.js';

/**
 * Internal utility for managing SessionKey lifecycle.
 * Handles both external SessionKey instances and internal SessionKeyConfig management.
 *
 * @internal - Not exposed in public API
 */
export class SessionKeyManager {
	private managedSessionKey?: SessionKey;

	constructor(
		private sessionKey: SessionKey | undefined,
		private sessionKeyConfig: SessionKeyConfig | undefined,
		private suiClient: MessagingCompatibleClient,
		private sealApproveContract: SealApproveContract,
	) {
		if (!sessionKey && !sessionKeyConfig) {
			throw new Error('Either sessionKey or sessionKeyConfig must be provided');
		}
		if (sessionKey && sessionKeyConfig) {
			throw new Error('Cannot provide both sessionKey and sessionKeyConfig. Choose one.');
		}
	}

	/**
	 * Get a valid SessionKey instance
	 */
	async getSessionKey(): Promise<SessionKey> {
		// External SessionKey case
		if (this.sessionKey) {
			if (this.sessionKey.isExpired()) {
				throw new Error(
					'The provided SessionKey has expired. Please provide a new SessionKey instance. ' +
						'When using an external SessionKey, lifecycle management is your responsibility.',
				);
			}
			return this.sessionKey;
		}

		// Managed SessionKey case
		if (this.sessionKeyConfig) {
			if (this.managedSessionKey && !this.managedSessionKey.isExpired()) {
				return this.managedSessionKey;
			}

			// Create or recreate the SessionKey
			this.managedSessionKey = await SessionKey.create({
				address: this.sessionKeyConfig.address,
				signer: this.sessionKeyConfig.signer,
				ttlMin: this.sessionKeyConfig.ttlMin,
				mvrName: this.sessionKeyConfig.mvrName,
				packageId: this.sealApproveContract.packageId,
				suiClient: this.suiClient,
			});

			return this.managedSessionKey;
		}

		throw new Error('Invalid SessionKeyManager state');
	}

	/**
	 * Update the external SessionKey instance
	 */
	updateExternalSessionKey(newSessionKey: SessionKey): void {
		if (!this.sessionKey) {
			throw new Error('Cannot update external SessionKey when using managed SessionKey');
		}
		this.sessionKey = newSessionKey;
	}

	/**
	 * Force refresh the managed SessionKey
	 */
	async refreshManagedSessionKey(): Promise<SessionKey> {
		if (!this.sessionKeyConfig) {
			throw new Error('Cannot refresh managed SessionKey when using external SessionKey');
		}
		this.managedSessionKey = undefined;
		return this.getSessionKey();
	}
}
