// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
export type StorageOptions = {
	[key: string]: unknown;
};

export type StorageConfig =
	| {
			publisher: string;
			aggregator: string;
			epochs: number;
			uploadRelay?: never;
	  }
	| {
			epochs: number;
			uploadRelay: string;
			aggregator: string;
			publisher?: never;
	  };

export interface StorageAdapter {
	upload(data: Uint8Array[], options: StorageOptions): Promise<{ ids: string[] }>;
	download(ids: string[]): Promise<Uint8Array[]>;
}
