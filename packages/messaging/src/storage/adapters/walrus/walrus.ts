import {StorageAdapter, StorageConfig, StorageOptions} from "../storage";
import {WalrusClient} from "@mysten/walrus";

export class WalrusStorageAdapter implements StorageAdapter {

  constructor(
    private readonly client: WalrusClient,
    private readonly config: StorageConfig,
  ) {}

  async upload(data: Uint8Array[], options: StorageOptions): Promise<{ids: string[]}> {
    return await this.#uploadQuilts(data); // todo: option handling for blobs vs quilts
  }

  async #uploadQuilts(data: Uint8Array[]): Promise<{ids: string[]}> {
    const formData = new FormData();
    for (const blob of data) {
      formData.append('file', new Blob([new Uint8Array(blob)]));
    }
    const response = await fetch(`${this.config.publisher}/v1/quilts`, {
      method: 'PUT',
      body: formData
    })
    if (!response.ok) {
      throw new Error(`Walrus upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    const blobId = this.#extractBlobId(result as WalrusResponse);
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