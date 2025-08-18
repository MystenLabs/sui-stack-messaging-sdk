export type StorageOptions = {
  [key: string]: any,
}

export type StorageConfig = {
  publisher: string,
  aggregator: string,
  uploadRelay?: never,
} | {
  uploadRelay: string,
  aggregator: string,
  publisher?: never,
}

export interface StorageAdapter {
  upload(data: Uint8Array[], options: StorageOptions): Promise<{ ids: string[] }>
}