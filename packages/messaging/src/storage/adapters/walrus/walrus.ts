// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { ClientWithExtensions } from '@mysten/sui/experimental';
import type { StorageAdapter, StorageConfig, StorageOptions } from '../storage.js';
import type { WalrusClient } from '@mysten/walrus';
import type { WalrusResponse } from './types.js';

import { getLogger, LOG_CATEGORIES } from '../../../logging/index.js';

export class WalrusStorageAdapter implements StorageAdapter {
	constructor(
		// Client parameter kept for future implementation - currently unused
		// @ts-expect-error TS6138 - intentionally unused parameter for future implementation
		private readonly _client: ClientWithExtensions<{ walrus?: WalrusClient }>,
		private readonly config: StorageConfig,
	) {}

	/**
	 * Upload data to Walrus storage
	 * @param data - Array of data to upload
	 * @param _options - Storage options (currently unused)
	 * @returns Upload result with blob IDs
	 */
	async upload(data: Uint8Array[], _options: StorageOptions): Promise<{ ids: string[] }> {
		const logger = getLogger(LOG_CATEGORIES.STORAGE_WALRUS);
		const totalBytes = data.reduce((sum, d) => sum + d.length, 0);

		logger.debug('Uploading to Walrus', {
			count: data.length,
			totalBytes,
			publisherUrl: this.config.publisher,
			epochs: this.config.epochs,
		});

		const result = await this.#uploadQuilts(data); // todo: option handling for blobs vs quilts

		logger.info('Uploaded to Walrus', {
			count: result.ids.length,
			blobIds: result.ids,
			totalBytes,
		});

		return result;
	}

	/**
	 * Download data from Walrus storage
	 * @param ids - Array of blob IDs to download
	 * @returns Array of downloaded data
	 */
	async download(ids: string[]): Promise<Uint8Array[]> {
		const logger = getLogger(LOG_CATEGORIES.STORAGE_WALRUS);
		logger.debug('Downloading from Walrus', {
			count: ids.length,
			ids,
			aggregatorUrl: this.config.aggregator,
		});

		if (ids.length === 0) {
			return [];
		}

		const result = await this.#downloadQuilts(ids);

		logger.info('Downloaded from Walrus', {
			count: result.length,
			totalBytes: result.reduce((sum, d) => sum + d.length, 0),
		});

		return result;
	}

	/**
	 * Upload data as quilts to Walrus
	 * @param data - Array of data to upload
	 * @returns Upload result with quilt patch IDs
	 */
	async #uploadQuilts(data: Uint8Array[]): Promise<{ ids: string[] }> {
		const formData = new FormData();

		for (let i = 0; i < data.length; i++) {
			const identifier = `attachment${i}`;
			const blob = new Blob([new Uint8Array(data[i])]);
			formData.append(identifier, blob);
		}

		const response = await fetch(
			`${this.config.publisher}/v1/quilts?epochs=${this.config.epochs}`,
			{
				method: 'PUT',
				body: formData,
			},
		);
		if (!response.ok) {
			// Read the error response body to get the actual error message
			const errorText = await response.text();
			const logger = getLogger(LOG_CATEGORIES.STORAGE_WALRUS);
			logger.error('Walrus upload failed', {
				status: response.status,
				statusText: response.statusText,
				errorText,
				publisherUrl: this.config.publisher,
			});
			throw new Error(
				`Walrus upload failed: ${response.status} ${response.statusText} - ${errorText}`,
			);
		}

		const result = await response.json();
		// TODO: figure out the Types, so we avoid the use of any
		return { ids: this.#extractQuiltsPatchIds(result as WalrusResponse) };
	}

	/**
	 * Download data from Walrus quilts
	 * @param patchIds - Array of quilt patch IDs to download
	 * @returns Array of downloaded data
	 */
	async #downloadQuilts(patchIds: string[]): Promise<Uint8Array[]> {
		/* OpenApi
  /v1/blobs/by-quilt-id/{quilt_id}/{identifier}:
    get:
      tags:
      - routes
      summary: Get blob from quilt by ID and identifier
      description: Retrieve a specific blob from a quilt using the quilt ID and its identifier. Returns the raw blob bytes, the identifier and other attributes are returned as headers. If the quilt ID or identifier is not found, the response is 404.
      operationId: get_blob_by_quilt_id_and_identifier
      parameters:
      - name: quilt_id
        in: path
        description: The quilt ID encoded as URL-safe base64
        required: true
        schema:
          $ref: '#/components/schemas/BlobId'
        example: rkcHpHQrornOymttgvSq3zvcmQEsMqzmeUM1HSY4ShU
      - name: identifier
        in: path
        description: The identifier of the blob within the quilt
        required: true
        schema:
          type: string
        example: my-file.txt
      responses:
        '200':
          description: The blob was retrieved successfully. Returns the raw blob bytes, the identifier and other attributes are returned as headers.
          content:
            application/octet-stream:
              schema:
                type: array
                items:
                  type: integer
                  format: int32
                  minimum: 0
        '404':
          description: May be returned when (1) The requested blob has not yet been stored on Walrus. (2) The requested quilt patch does not exist on Walrus.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Status'
        '451':
          description: The blob cannot be returned as has been blocked.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Status'
        '500':
          description: An internal server error has occurred. Please report this error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Status'
		*/

		const response = await Promise.all(
			patchIds.map(
				async (id) => await fetch(`${this.config.aggregator}/v1/blobs/by-quilt-patch-id/${id}`),
			),
		);
		const data = await Promise.all(response.map(async (response) => await response.arrayBuffer()));
		return data.map((data) => new Uint8Array(data));
	}

	/**
	 * Extract blob ID from Walrus response
	 * @param response - Walrus API response
	 * @returns Extracted blob ID
	 */
	// @ts-expect-error Method is currently unused but kept for future implementation
	#extractBlobId(response: WalrusResponse): string {
		// direct blob uploads
		if (response.newlyCreated?.blobObject?.blobId) {
			return response.newlyCreated.blobObject.blobId;
		}
		if (response.alreadyCertified?.blobId) {
			return response.alreadyCertified.blobId;
		}

		// quilt uploads
		if (response.blobStoreResult?.newlyCreated?.blobObject?.blobId) {
			return response.blobStoreResult.newlyCreated.blobObject.blobId;
		}

		throw new Error('Unable to extract blob ID from response');
	}

	/**
	 * Extract quilt patch IDs from Walrus response
	 * @param response - Walrus API response
	 * @returns Array of quilt patch IDs
	 */
	#extractQuiltsPatchIds(response: WalrusResponse): string[] {
		if (response.storedQuiltBlobs) {
			return response.storedQuiltBlobs.map((quilt) => quilt.quiltPatchId);
		}

		throw new Error('Unable to extract quilt patch IDs from response');
	}
}
