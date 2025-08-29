export interface BlobObject {
	id: string;
	registeredEpoch: number;
	blobId: string;
	size: number;
	encodingType: string;
	certifiedEpoch: number | null;
	storage: {
		id: string;
		startEpoch: number;
		endEpoch: number;
		storageSize: number;
	};
	deletable: boolean;
}

export interface NewlyCreatedBlob {
	blobObject: BlobObject;
	resourceOperation: {
		registerFromScratch: {
			encodedLength: number;
			epochsAhead: number;
		};
	};
	cost: number;
}

export interface AlreadyCertifiedBlob {
	blobId: string;
	event: {
		txDigest: string;
		eventSeq: string;
	};
	endEpoch: number;
}

export interface QuiltBlob {
	identifier: string;
	quiltPatchId: string;
}

export interface WalrusResponse {
	newlyCreated?: NewlyCreatedBlob;
	alreadyCertified?: AlreadyCertifiedBlob;
	blobStoreResult?: {
		newlyCreated?: NewlyCreatedBlob;
	};
	storedQuiltBlobs?: QuiltBlob[];
}
