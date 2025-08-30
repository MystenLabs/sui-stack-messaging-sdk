import { ClientWithExtensions } from '@mysten/sui/dist/cjs/experimental';
import { StorageAdapter, StorageConfig, StorageOptions } from '../storage';
import { WalrusClient } from '@mysten/walrus';
import { WalrusResponse } from './types';

export class WalrusStorageAdapter implements StorageAdapter {
	constructor(
		private readonly client: ClientWithExtensions<{ walrus: WalrusClient }>,
		private readonly config: StorageConfig,
	) {}

	async upload(data: Uint8Array[], options: StorageOptions): Promise<{ ids: string[] }> {
		return await this.#uploadQuilts(data); // todo: option handling for blobs vs quilts
	}

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
			console.error('Error response body:', errorText);
			throw new Error(
				`Walrus upload failed: ${response.status} ${response.statusText} - ${errorText}`,
			);
		}

		const result = await response.json();
		const blobId = this.#extractBlobId(result as WalrusResponse);
		// TODO: figure out the Types, so we avoid the use of any
		//  // @ts-ignore
		// console.log((await this.client.walrus.getBlob({blobId})));
		return { ids: [blobId] };
	}

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
}
