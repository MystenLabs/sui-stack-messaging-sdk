// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	Experimental_CoreClientOptions,
	Experimental_SuiClientTypes,
} from '@mysten/sui/experimental';
import { Experimental_CoreClient } from '@mysten/sui/experimental';
import type { SuiGrpcClient } from './client.js';
import type { Owner } from './proto/sui/rpc/v2beta2/owner.js';
import { Owner_OwnerKind } from './proto/sui/rpc/v2beta2/owner.js';
import { chunk, fromBase64, toBase64 } from '@mysten/utils';
import type { ExecutedTransaction } from './proto/sui/rpc/v2beta2/executed_transaction.js';
import type { TransactionEffects } from './proto/sui/rpc/v2beta2/effects.js';
import { UnchangedConsensusObject_UnchangedConsensusObjectKind } from './proto/sui/rpc/v2beta2/effects.js';
import {
	ChangedObject_IdOperation,
	ChangedObject_InputObjectState,
	ChangedObject_OutputObjectState,
} from './proto/sui/rpc/v2beta2/effects.js';
import { TransactionDataBuilder } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import type { OpenSignature, OpenSignatureBody } from './proto/sui/rpc/v2beta2/move_package.js';
import {
	Ability,
	FunctionDescriptor_Visibility,
	OpenSignature_Reference,
	OpenSignatureBody_Type,
} from './proto/sui/rpc/v2beta2/move_package.js';
import { Inputs } from '@mysten/sui/transactions';
import { SUI_TYPE_ARG } from '@mysten/sui/utils';
import type { OpenMoveTypeSignature, OpenMoveTypeSignatureBody } from '@mysten/sui/transactions';
export interface GrpcCoreClientOptions extends Experimental_CoreClientOptions {
	client: SuiGrpcClient;
}
export class GrpcCoreClient extends Experimental_CoreClient {
	#client: SuiGrpcClient;
	constructor({ client, ...options }: GrpcCoreClientOptions) {
		super(options);
		this.#client = client;
	}

	async getObjects(
		options: Experimental_SuiClientTypes.GetObjectsOptions,
	): Promise<Experimental_SuiClientTypes.GetObjectsResponse> {
		console.log('[GRPC getObjects] Fetching objects:', options.objectIds);
		const batches = chunk(options.objectIds, 50);
		const results: Experimental_SuiClientTypes.GetObjectsResponse['objects'] = [];

		for (const batch of batches) {
			const response = await this.#client.ledgerService.batchGetObjects({
				requests: batch.map((id) => ({ objectId: id })),
				readMask: {
					paths: [
						'owner',
						'object_type',
						'bcs',
						'digest',
						'version',
						'object_id',
						'previous_transaction',
					],
				},
			});

			results.push(
				...response.response.objects.map(
					(object): Experimental_SuiClientTypes.ObjectResponse | Error => {
						if (object.result.oneofKind === 'error') {
							// TODO: improve error handling
							return new Error(object.result.error.message);
						}

						if (object.result.oneofKind !== 'object') {
							return new Error('Unexpected result type');
						}

						console.log('[GRPC getObjects] Raw object response:', {
							objectId: object.result.object.objectId,
							version: object.result.object.version?.toString(),
							digest: object.result.object.digest,
							objectType: object.result.object.objectType,
							bcsValueType: typeof object.result.object.bcs?.value,
							bcsValueLength: object.result.object.bcs?.value?.length,
							bcsValuePreview: object.result.object.bcs?.value?.slice(0, 50),
						});

						return {
							id: object.result.object.objectId!,
							version: object.result.object.version?.toString()!,
							digest: object.result.object.digest!,
							// TODO: bcs content is not returned in all cases
							content: Promise.resolve(object.result.object.bcs?.value!),
							owner: mapOwner(object.result.object.owner)!,
							type: object.result.object.objectType!,
							previousTransaction: object.result.object.previousTransaction ?? null,
						};
					},
				),
			);
		}

		console.log('[GRPC getObjects] Returning', results.length, 'objects');
		return {
			objects: results,
		};
	}
	async getOwnedObjects(
		options: Experimental_SuiClientTypes.GetOwnedObjectsOptions,
	): Promise<Experimental_SuiClientTypes.GetOwnedObjectsResponse> {
		const response = await this.#client.liveDataService.listOwnedObjects({
			owner: options.address,
			objectType: options.type
				? (await this.mvr.resolveType({ type: options.type })).type
				: undefined,
			pageToken: options.cursor ? fromBase64(options.cursor) : undefined,
			readMask: {
				paths: [
					'owner',
					'object_type',
					'bcs',
					'digest',
					'version',
					'object_id',
					'previous_transaction',
				],
			},
		});

		const objects = response.response.objects.map(
			(object): Experimental_SuiClientTypes.ObjectResponse => ({
				id: object.objectId!,
				version: object.version?.toString()!,
				digest: object.digest!,
				// TODO: List owned objects doesn't return content right now
				get content() {
					return Promise.reject(
						new Error('GRPC does not return object contents when listing owned objects'),
					);
				},
				owner: mapOwner(object.owner)!,
				type: object.objectType!,
				previousTransaction: object.previousTransaction ?? null,
			}),
		);

		return {
			objects,
			cursor: response.response.nextPageToken ? toBase64(response.response.nextPageToken) : null,
			hasNextPage: response.response.nextPageToken !== undefined,
		};
	}
	async getCoins(
		options: Experimental_SuiClientTypes.GetCoinsOptions,
	): Promise<Experimental_SuiClientTypes.GetCoinsResponse> {
		const response = await this.#client.liveDataService.listOwnedObjects({
			owner: options.address,
			objectType: `0x2::coin::Coin<${(await this.mvr.resolveType({ type: options.coinType })).type}>`,
			pageToken: options.cursor ? fromBase64(options.cursor) : undefined,
			readMask: {
				paths: [
					'owner',
					'object_type',
					'bcs',
					'digest',
					'version',
					'object_id',
					'balance',
					'previous_transaction',
				],
			},
		});

		return {
			objects: response.response.objects.map(
				(object): Experimental_SuiClientTypes.CoinResponse => ({
					id: object.objectId!,
					version: object.version?.toString()!,
					digest: object.digest!,
					// TODO: List owned objects doesn't return content right now
					get content() {
						return Promise.reject(
							new Error('GRPC does not return object contents when listing owned objects'),
						);
					},
					owner: mapOwner(object.owner)!,
					type: object.objectType!,
					balance: object.balance?.toString()!,
					previousTransaction: object.previousTransaction ?? null,
				}),
			),
			cursor: response.response.nextPageToken ? toBase64(response.response.nextPageToken) : null,
			hasNextPage: response.response.nextPageToken !== undefined,
		};
	}

	async getBalance(
		options: Experimental_SuiClientTypes.GetBalanceOptions,
	): Promise<Experimental_SuiClientTypes.GetBalanceResponse> {
		const result = await this.#client.liveDataService.getBalance({
			owner: options.address,
			coinType: (await this.mvr.resolveType({ type: options.coinType })).type,
		});

		return {
			balance: {
				balance: result.response.balance?.balance?.toString() ?? '0',
				coinType: result.response.balance?.coinType ?? options.coinType,
			},
		};
	}

	async getAllBalances(
		options: Experimental_SuiClientTypes.GetAllBalancesOptions,
	): Promise<Experimental_SuiClientTypes.GetAllBalancesResponse> {
		const result = await this.#client.liveDataService.listBalances({
			owner: options.address,
			pageToken: options.cursor ? fromBase64(options.cursor) : undefined,
			pageSize: options.limit,
		});

		return {
			hasNextPage: !!result.response.nextPageToken,
			cursor: result.response.nextPageToken ? toBase64(result.response.nextPageToken) : null,
			balances: result.response.balances.map((balance) => ({
				balance: balance.balance?.toString() ?? '0',
				coinType: balance.coinType!,
			})),
		};
	}
	async getTransaction(
		options: Experimental_SuiClientTypes.GetTransactionOptions,
	): Promise<Experimental_SuiClientTypes.GetTransactionResponse> {
		const { response } = await this.#client.ledgerService.getTransaction({
			digest: options.digest,
			readMask: {
				paths: ['digest', 'transaction', 'effects', 'signatures', 'balance_changes'],
			},
		});

		return {
			transaction: parseTransaction(response.transaction!),
		};
	}
	async executeTransaction(
		options: Experimental_SuiClientTypes.ExecuteTransactionOptions,
	): Promise<Experimental_SuiClientTypes.ExecuteTransactionResponse> {
		const { response } = await this.#client.transactionExecutionService.executeTransaction({
			transaction: {
				bcs: {
					value: options.transaction,
				},
			},
			signatures: options.signatures.map((signature) => ({
				bcs: {
					value: fromBase64(signature),
				},
				signature: {
					oneofKind: undefined,
				},
			})),
			readMask: {
				paths: [
					'transaction.digest',
					'transaction.transaction',
					'transaction.effects',
					'transaction.signatures',
					'transaction.balance_changes',
				],
			},
		});
		return {
			transaction: parseTransaction(response.transaction!),
		};
	}
	async dryRunTransaction(
		options: Experimental_SuiClientTypes.DryRunTransactionOptions,
	): Promise<Experimental_SuiClientTypes.DryRunTransactionResponse> {
		const { response } = await this.#client.liveDataService.simulateTransaction({
			transaction: {
				bcs: {
					value: options.transaction,
				},
			},
			readMask: {
				paths: [
					'transaction.digest',
					'transaction.transaction',
					'transaction.effects',
					'transaction.signatures',
					'transaction.balance_changes',
				],
			},
		});

		return {
			transaction: parseTransaction(response.transaction!),
		};
	}
	async getReferenceGasPrice(): Promise<Experimental_SuiClientTypes.GetReferenceGasPriceResponse> {
		const response = await this.#client.ledgerService.getEpoch({});

		return {
			referenceGasPrice: response.response.epoch?.referenceGasPrice?.toString()!,
		};
	}

	async getDynamicFields(
		options: Experimental_SuiClientTypes.GetDynamicFieldsOptions,
	): Promise<Experimental_SuiClientTypes.GetDynamicFieldsResponse> {
		const response = await this.#client.liveDataService.listDynamicFields({
			parent: options.parentId,
			pageToken: options.cursor ? fromBase64(options.cursor) : undefined,
		});

		return {
			dynamicFields: response.response.dynamicFields.map((field) => ({
				id: field.fieldId!,
				name: {
					type: field.nameType!,
					bcs: field.nameValue!,
				},
				type: field.dynamicObjectId
					? `0x2::dynamic_field::Field<0x2::dynamic_object_field::Wrapper<${field.nameType!}>,0x2::object::ID>`
					: `0x2::dynamic_field::Field<${field.nameType!},${field.valueType!}>`,
			})),
			cursor: response.response.nextPageToken ? toBase64(response.response.nextPageToken) : null,
			hasNextPage: response.response.nextPageToken !== undefined,
		};
	}

	async verifyZkLoginSignature(
		options: Experimental_SuiClientTypes.VerifyZkLoginSignatureOptions,
	): Promise<Experimental_SuiClientTypes.ZkLoginVerifyResponse> {
		const { response } = await this.#client.signatureVerificationService.verifySignature({
			message: {
				name: options.intentScope,
				value: fromBase64(options.bytes),
			},
			signature: {
				bcs: {
					value: fromBase64(options.signature),
				},
				signature: {
					oneofKind: undefined,
				},
			},
			jwks: [],
		});

		return {
			success: response.isValid ?? false,
			errors: response.reason ? [response.reason] : [],
		};
	}

	async getMoveFunction(
		options: Experimental_SuiClientTypes.GetMoveFunctionOptions,
	): Promise<Experimental_SuiClientTypes.GetMoveFunctionResponse> {
		const { response } = await this.#client.movePackageService.getFunction({
			packageId: (await this.mvr.resolvePackage({ package: options.packageId })).package,
			moduleName: options.moduleName,
			name: options.name,
		});

		let visibility: 'public' | 'private' | 'friend' | 'unknown' = 'unknown';

		switch (response.function?.visibility) {
			case FunctionDescriptor_Visibility.PUBLIC:
				visibility = 'public';
				break;
			case FunctionDescriptor_Visibility.PRIVATE:
				visibility = 'private';
				break;
			case FunctionDescriptor_Visibility.FRIEND:
				visibility = 'friend';
				break;
		}

		return {
			function: {
				packageId: options.packageId,
				moduleName: options.moduleName,
				name: response.function?.name!,
				visibility,
				isEntry: response.function?.isEntry ?? false,
				typeParameters:
					response.function?.typeParameters?.map(({ constraints }) => ({
						isPhantom: false,
						constraints:
							constraints.map((constraint) => {
								switch (constraint) {
									case Ability.COPY:
										return 'copy';
									case Ability.DROP:
										return 'drop';
									case Ability.STORE:
										return 'store';
									case Ability.KEY:
										return 'key';
									default:
										return 'unknown';
								}
							}) ?? [],
					})) ?? [],
				parameters:
					response.function?.parameters?.map((param) => parseNormalizedSuiMoveType(param)) ?? [],
				returns: response.function?.returns?.map((ret) => parseNormalizedSuiMoveType(ret)) ?? [],
			},
		};
	}

	resolveTransactionPlugin() {
		return async (
			transactionData: TransactionDataBuilder,
			_options: unknown,
			next: () => Promise<void>,
		) => {
			console.log('[GRPC] Starting transaction resolution...');

			// Step 1: Set gas price if not already set
			if (!transactionData.gasConfig.price) {
				console.log('[GRPC] Fetching gas price...');
				const { referenceGasPrice } = await this.getReferenceGasPrice();
				transactionData.gasConfig.price = referenceGasPrice;
				console.log('[GRPC] Gas price set:', referenceGasPrice);
			}

			// Step 2: Resolve object inputs FIRST (before dry run to avoid BCS errors)
			console.log('[GRPC] Resolving object inputs before dry run...');
			await this.#resolveObjectInputs(transactionData);
			console.log('[GRPC] Object inputs resolved');

			// Step 3: Set gas budget if not already set (requires dry run)
			if (!transactionData.gasConfig.budget) {
				console.log('[GRPC] Calculating gas budget via dry run...');
				const MAX_GAS = 50_000_000_000n;
				const GAS_SAFE_OVERHEAD = 1000n;

				// Build temporary transaction with max gas for dry run
				console.log('[GRPC] Building transaction for dry run...');
				console.log('[GRPC] Transaction inputs after resolution:', JSON.stringify(transactionData.inputs.map((input, idx) => ({
					index: idx,
					kind: input.$kind,
					details: input
				})), null, 2));
				const dryRunTx = transactionData.build({
					overrides: {
						gasData: {
							budget: String(MAX_GAS),
							payment: [],
						},
					},
				});
				console.log('[GRPC] Transaction built successfully');

				// Call simulateTransaction directly to avoid parseTransaction issues
				const { response } = await this.#client.liveDataService.simulateTransaction({
					transaction: {
						bcs: {
							value: dryRunTx,
						},
					},
					readMask: {
						paths: ['transaction.effects'],
					},
				});

				if (!response.transaction?.effects) {
					throw new Error('Dry run failed: no effects returned');
				}

				const effects = parseTransactionEffects({
					effects: response.transaction.effects,
				});

				if (!effects) {
					throw new Error('Dry run failed: could not parse effects');
				}

				const safeOverhead = GAS_SAFE_OVERHEAD * BigInt(transactionData.gasConfig.price || 1n);
				const baseComputationCostWithOverhead =
					BigInt(effects.gasUsed.computationCost) + safeOverhead;

				const gasBudget =
					baseComputationCostWithOverhead +
					BigInt(effects.gasUsed.storageCost) -
					BigInt(effects.gasUsed.storageRebate);

				transactionData.gasConfig.budget = String(
					gasBudget > baseComputationCostWithOverhead ? gasBudget : baseComputationCostWithOverhead,
				);
			}

			// Step 3: Set gas payment if not already set
			if (!transactionData.gasConfig.payment || transactionData.gasConfig.payment.length === 0) {
				console.log('[GRPC] Fetching gas payment coins...');
				const owner = transactionData.gasConfig.owner || transactionData.sender!;
				const { objects: coins } = await this.getCoins({
					address: owner,
					coinType: SUI_TYPE_ARG,
				});
				console.log('[GRPC] Found', coins.length, 'coins');

				// Filter out coins already used as transaction inputs and map to ObjectRef format
				const paymentCoins = coins
					.filter((coin) => {
						const matchingInput = transactionData.inputs.find((input) => {
							if (
								input.$kind === 'Object' &&
								input.Object?.$kind === 'ImmOrOwnedObject'
							) {
								return coin.id === input.Object.ImmOrOwnedObject.objectId;
							}
							return false;
						});
						return !matchingInput;
					})
					.map((coin) => ({
						objectId: coin.id,
						version: String(coin.version),
						digest: coin.digest,
					}));

				if (paymentCoins.length === 0) {
					throw new Error(
						`No valid gas coins found for sender ${owner}. Coins may be locked or in use.`,
					);
				}

				transactionData.gasConfig.payment = paymentCoins;
			}

			console.log('[GRPC] Calling next()...');
			await next();
			console.log('[GRPC] Transaction resolution complete!');
		};
	}

	async #resolveObjectInputs(transactionData: TransactionDataBuilder) {
		// Collect all unresolved object IDs
		const unresolvedObjects: { index: number; objectId: string }[] = [];

		transactionData.inputs.forEach((input, index) => {
			if (input.$kind === 'UnresolvedObject') {
				unresolvedObjects.push({ index, objectId: input.UnresolvedObject.objectId });
			} else if (
				input.$kind === 'Object' &&
				input.Object?.$kind === 'ImmOrOwnedObject' &&
				!input.Object.ImmOrOwnedObject.version
			) {
				unresolvedObjects.push({ index, objectId: input.Object.ImmOrOwnedObject.objectId });
			} else if (
				input.$kind === 'Object' &&
				input.Object?.$kind === 'SharedObject' &&
				!input.Object.SharedObject.initialSharedVersion
			) {
				unresolvedObjects.push({ index, objectId: input.Object.SharedObject.objectId });
			}
		});

		if (unresolvedObjects.length === 0) {
			return;
		}

		// Fetch object details
		const objectIds = unresolvedObjects.map((obj) => obj.objectId);
		const { objects } = await this.getObjects({ objectIds });

		// Resolve each object
		for (let i = 0; i < unresolvedObjects.length; i++) {
			const { index } = unresolvedObjects[i];
			const objectResult = objects[i];

			if (objectResult instanceof Error) {
				throw new Error(`Failed to resolve object ${objectIds[i]}: ${objectResult.message}`);
			}

			const { id, version, digest, owner } = objectResult;

			// Determine if object is shared
			let initialSharedVersion: string | null = null;
			if (owner && typeof owner === 'object') {
				if ('Shared' in owner && owner.Shared) {
					initialSharedVersion = owner.Shared.initialSharedVersion;
				} else if ('ConsensusAddressOwner' in owner && owner.ConsensusAddressOwner) {
					initialSharedVersion = owner.ConsensusAddressOwner.startVersion;
				}
			}

			// Determine mutability
			const mutable = this.#isUsedAsMutable(transactionData, index);

			// Create appropriate input type
			// Ensure all values are strings
			const objectId = String(id);
			const versionStr = String(version);
			const digestStr = String(digest);

			if (initialSharedVersion) {
				transactionData.inputs[index] = Inputs.SharedObjectRef({
					objectId,
					initialSharedVersion: String(initialSharedVersion),
					mutable,
				});
			} else if (this.#isUsedAsReceiving(transactionData, index)) {
				transactionData.inputs[index] = Inputs.ReceivingRef({
					objectId,
					digest: digestStr,
					version: versionStr,
				});
			} else {
				transactionData.inputs[index] = Inputs.ObjectRef({
					objectId,
					digest: digestStr,
					version: versionStr,
				});
			}
		}
	}

	#isUsedAsMutable(transactionData: TransactionDataBuilder, index: number): boolean {
		let usedAsMutable = false;

		transactionData.getInputUses(index, (arg, tx) => {
			if (tx.$kind === 'MoveCall' && tx.MoveCall._argumentTypes) {
				const argIndex = tx.MoveCall.arguments.indexOf(arg);
				if (argIndex !== -1 && tx.MoveCall._argumentTypes[argIndex]) {
					usedAsMutable = tx.MoveCall._argumentTypes[argIndex].ref !== '&' || usedAsMutable;
				}
			}

			// These commands always use objects mutably
			if (
				tx.$kind === 'MakeMoveVec' ||
				tx.$kind === 'MergeCoins' ||
				tx.$kind === 'SplitCoins' ||
				tx.$kind === 'TransferObjects'
			) {
				usedAsMutable = true;
			}
		});

		return usedAsMutable;
	}

	#isUsedAsReceiving(transactionData: TransactionDataBuilder, index: number): boolean {
		let usedAsReceiving = false;

		transactionData.getInputUses(index, (arg, tx) => {
			if (tx.$kind === 'MoveCall' && tx.MoveCall._argumentTypes) {
				const argIndex = tx.MoveCall.arguments.indexOf(arg);
				if (argIndex !== -1 && tx.MoveCall._argumentTypes[argIndex]) {
					const argType = tx.MoveCall._argumentTypes[argIndex];
					usedAsReceiving = this.#isReceivingType(argType) || usedAsReceiving;
				}
			}
		});

		return usedAsReceiving;
	}

	#isReceivingType(type: OpenMoveTypeSignature): boolean {
		return this.#checkReceivingTypeBody(type.body);
	}

	#checkReceivingTypeBody(body: OpenMoveTypeSignatureBody): boolean {
		// OpenMoveTypeSignatureBody is a union type, so we need to check if it's the datatype variant
		if (typeof body === 'object' && 'datatype' in body) {
			return (
				body.datatype.package === '0x2' &&
				body.datatype.module === 'transfer' &&
				body.datatype.type === 'Receiving'
			);
		}
		return false;
	}
}

function mapOwner(owner: Owner | null | undefined): Experimental_SuiClientTypes.ObjectOwner | null {
	if (!owner) {
		return null;
	}
	if (owner.kind === Owner_OwnerKind.IMMUTABLE) {
		return {
			$kind: 'Immutable',
			Immutable: true,
		};
	}
	if (owner.kind === Owner_OwnerKind.ADDRESS) {
		return {
			AddressOwner: owner.address!,
			$kind: 'AddressOwner',
		};
	}
	if (owner.kind === Owner_OwnerKind.OBJECT) {
		return {
			$kind: 'ObjectOwner',
			ObjectOwner: owner.address!,
		};
	}

	if (owner.kind === Owner_OwnerKind.SHARED) {
		if (owner.address) {
			return {
				$kind: 'ConsensusAddressOwner',
				ConsensusAddressOwner: {
					owner: owner.address,
					startVersion: owner.version?.toString()!,
				},
			};
		}
		return {
			$kind: 'Shared',
			Shared: {
				initialSharedVersion: owner.version?.toString()!,
			},
		};
	}

	throw new Error('Unknown owner kind');
}

function mapIdOperation(
	operation: ChangedObject_IdOperation | undefined,
): null | 'Created' | 'Deleted' | 'Unknown' | 'None' {
	if (operation == null) {
		return null;
	}
	switch (operation) {
		case ChangedObject_IdOperation.CREATED:
			return 'Created';
		case ChangedObject_IdOperation.DELETED:
			return 'Deleted';
		case ChangedObject_IdOperation.NONE:
		case ChangedObject_IdOperation.ID_OPERATION_UNKNOWN:
			return 'None';
		default:
			operation satisfies never;
			return 'Unknown';
	}
}

function mapInputObjectState(
	state: ChangedObject_InputObjectState | undefined,
): null | 'Exists' | 'DoesNotExist' | 'Unknown' {
	if (state == null) {
		return null;
	}
	switch (state) {
		case ChangedObject_InputObjectState.EXISTS:
			return 'Exists';
		case ChangedObject_InputObjectState.DOES_NOT_EXIST:
			return 'DoesNotExist';
		case ChangedObject_InputObjectState.UNKNOWN:
			return 'Unknown';
		default:
			state satisfies never;
			return 'Unknown';
	}
}

function mapOutputObjectState(
	state: ChangedObject_OutputObjectState | undefined,
): null | 'ObjectWrite' | 'PackageWrite' | 'DoesNotExist' | 'Unknown' {
	if (state == null) {
		return null;
	}
	switch (state) {
		case ChangedObject_OutputObjectState.OBJECT_WRITE:
			return 'ObjectWrite';
		case ChangedObject_OutputObjectState.PACKAGE_WRITE:
			return 'PackageWrite';
		case ChangedObject_OutputObjectState.DOES_NOT_EXIST:
			return 'DoesNotExist';
		case ChangedObject_OutputObjectState.UNKNOWN:
			return 'Unknown';
		default:
			state satisfies never;
			return 'Unknown';
	}
}

function mapUnchangedConsensusObjectKind(
	kind: UnchangedConsensusObject_UnchangedConsensusObjectKind | undefined,
): null | Experimental_SuiClientTypes.UnchangedConsensusObject['kind'] {
	if (kind == null) {
		return null;
	}
	switch (kind) {
		case UnchangedConsensusObject_UnchangedConsensusObjectKind.UNCHANGED_CONSENSUS_OBJECT_KIND_UNKNOWN:
			return 'Unknown';
		case UnchangedConsensusObject_UnchangedConsensusObjectKind.READ_ONLY_ROOT:
			return 'ReadOnlyRoot';
		case UnchangedConsensusObject_UnchangedConsensusObjectKind.MUTATE_CONSENSUS_STREAM_ENDED:
			return 'MutateConsensusStreamEnded';
		case UnchangedConsensusObject_UnchangedConsensusObjectKind.READ_CONSENSUS_STREAM_ENDED:
			return 'ReadConsensusStreamEnded';
		case UnchangedConsensusObject_UnchangedConsensusObjectKind.CANCELED:
			return 'Cancelled';
		case UnchangedConsensusObject_UnchangedConsensusObjectKind.PER_EPOCH_CONFIG:
			return 'PerEpochConfig';
		default:
			kind satisfies never;
			return 'Unknown';
	}
}

export function parseTransactionEffects({
	effects,
}: {
	effects: TransactionEffects | undefined;
}): Experimental_SuiClientTypes.TransactionEffects | null {
	if (!effects) {
		return null;
	}

	const changedObjects = effects.changedObjects.map(
		(change): Experimental_SuiClientTypes.ChangedObject => {
			return {
				id: change.objectId!,
				inputState: mapInputObjectState(change.inputState)!,
				inputVersion: change.inputVersion?.toString() ?? null,
				inputDigest: change.inputDigest ?? null,
				inputOwner: mapOwner(change.inputOwner),
				outputState: mapOutputObjectState(change.outputState)!,
				outputVersion: change.outputVersion?.toString() ?? null,
				outputDigest: change.outputDigest ?? null,
				outputOwner: mapOwner(change.outputOwner),
				idOperation: mapIdOperation(change.idOperation)!,
			};
		},
	);

	return {
		bcs: effects.bcs?.value!,
		digest: effects.digest!,
		version: 2,
		status: effects.status?.success
			? {
					success: true,
					error: null,
				}
			: {
					success: false,
					// TODO: parse errors properly - use replacer to handle BigInt
					error: JSON.stringify(effects.status?.error, (_, value) =>
						typeof value === 'bigint' ? value.toString() : value
					),
				},
		gasUsed: {
			computationCost: effects.gasUsed?.computationCost?.toString()!,
			storageCost: effects.gasUsed?.storageCost?.toString()!,
			storageRebate: effects.gasUsed?.storageRebate?.toString()!,
			nonRefundableStorageFee: effects.gasUsed?.nonRefundableStorageFee?.toString()!,
		},
		transactionDigest: effects.transactionDigest!,
		gasObject: {
			id: effects.gasObject?.objectId!,
			inputState: mapInputObjectState(effects.gasObject?.inputState)!,
			inputVersion: effects.gasObject?.inputVersion?.toString() ?? null,
			inputDigest: effects.gasObject?.inputDigest ?? null,
			inputOwner: mapOwner(effects.gasObject?.inputOwner),
			outputState: mapOutputObjectState(effects.gasObject?.outputState)!,
			outputVersion: effects.gasObject?.outputVersion?.toString() ?? null,
			outputDigest: effects.gasObject?.outputDigest ?? null,
			outputOwner: mapOwner(effects.gasObject?.outputOwner),
			idOperation: mapIdOperation(effects.gasObject?.idOperation)!,
		},
		eventsDigest: effects.eventsDigest ?? null,
		dependencies: effects.dependencies,
		lamportVersion: effects.lamportVersion?.toString() ?? null,
		changedObjects,
		unchangedConsensusObjects: effects.unchangedConsensusObjects.map(
			(object): Experimental_SuiClientTypes.UnchangedConsensusObject => {
				return {
					kind: mapUnchangedConsensusObjectKind(object.kind)!,
					// TODO: we are inconsistent about id vs objectId
					objectId: object.objectId!,
					version: object.version?.toString() ?? null,
					digest: object.digest ?? null,
				};
			},
		),
		auxiliaryDataDigest: effects.auxiliaryDataDigest ?? null,
	};
}

function parseTransaction(
	transaction: ExecutedTransaction,
): Experimental_SuiClientTypes.TransactionResponse {
	const txBytes = transaction.transaction?.bcs?.value!;

	// Try to parse as SenderSignedData first, fallback to TransactionData
	let parsedTxData: any;
	let bytes: Uint8Array;
	let signatures: string[] = [];

	try {
		// Try parsing as SenderSignedData (vector of SenderSignedTransaction)
		const senderSignedData = bcs.SenderSignedData.parse(txBytes);
		const parsedTx = senderSignedData[0]; // Get first transaction
		parsedTxData = parsedTx.intentMessage.value;
		bytes = bcs.TransactionData.serialize(parsedTxData).toBytes();
		signatures = parsedTx.txSignatures;
	} catch {
		// Fallback: parse as TransactionData directly
		const txData = bcs.TransactionData.parse(txBytes);
		parsedTxData = txData;
		bytes = txBytes;
		// Get signatures from the transaction.signatures field if available
		signatures = transaction.signatures?.map(sig =>
			sig.bcs?.value ? toBase64(sig.bcs.value) : ''
		).filter(Boolean) ?? [];
	}

	const data = TransactionDataBuilder.restore({
		version: 2,
		sender: parsedTxData.V1.sender,
		expiration: parsedTxData.V1.expiration,
		gasData: parsedTxData.V1.gasData,
		inputs: parsedTxData.V1.kind.ProgrammableTransaction!.inputs,
		commands: parsedTxData.V1.kind.ProgrammableTransaction!.commands,
	});

	const objectTypes: Record<string, string> = {};
	transaction.inputObjects.forEach((object) => {
		if (object.objectId && object.objectType) {
			objectTypes[object.objectId] = object.objectType;
		}
	});

	transaction.outputObjects.forEach((object) => {
		if (object.objectId && object.objectType) {
			objectTypes[object.objectId] = object.objectType;
		}
	});

	const effects = parseTransactionEffects({
		effects: transaction.effects,
	})!;

	return {
		digest: transaction.digest!,
		epoch: transaction.effects?.epoch?.toString() ?? null,
		effects,
		objectTypes: Promise.resolve(objectTypes),
		transaction: {
			...data,
			bcs: bytes,
		},
		signatures,
		balanceChanges:
			transaction.balanceChanges?.map((change) => ({
				coinType: change.coinType!,
				address: change.address!,
				amount: change.amount!,
			})) ?? [],
	};
}

function parseNormalizedSuiMoveType(
	type: OpenSignature,
): Experimental_SuiClientTypes.OpenSignature {
	let reference: 'mutable' | 'immutable' | null = null;

	if (type.reference === OpenSignature_Reference.IMMUTABLE) {
		reference = 'immutable';
	} else if (type.reference === OpenSignature_Reference.MUTABLE) {
		reference = 'mutable';
	}

	return {
		reference,
		body: parseNormalizedSuiMoveTypeBody(type.body!),
	};
}

function parseNormalizedSuiMoveTypeBody(
	type: OpenSignatureBody,
): Experimental_SuiClientTypes.OpenSignatureBody {
	switch (type.type) {
		case OpenSignatureBody_Type.TYPE_UNKNOWN:
			return { $kind: 'unknown' };
		case OpenSignatureBody_Type.ADDRESS:
			return { $kind: 'address' };
		case OpenSignatureBody_Type.BOOL:
			return { $kind: 'bool' };
		case OpenSignatureBody_Type.U8:
			return { $kind: 'u8' };
		case OpenSignatureBody_Type.U16:
			return { $kind: 'u16' };
		case OpenSignatureBody_Type.U32:
			return { $kind: 'u32' };
		case OpenSignatureBody_Type.U64:
			return { $kind: 'u64' };
		case OpenSignatureBody_Type.U128:
			return { $kind: 'u128' };
		case OpenSignatureBody_Type.U256:
			return { $kind: 'u256' };
		case OpenSignatureBody_Type.VECTOR:
			return {
				$kind: 'vector',
				vector: parseNormalizedSuiMoveTypeBody(type.typeParameterInstantiation[0]),
			};
		case OpenSignatureBody_Type.DATATYPE:
			return {
				$kind: 'datatype',
				datatype: {
					typeName: type.typeName!,
					typeParameters: type.typeParameterInstantiation.map((t) =>
						parseNormalizedSuiMoveTypeBody(t),
					),
				},
			};
		case OpenSignatureBody_Type.TYPE_PARAMETER:
			return {
				$kind: 'typeParameter',
				index: type.typeParameter!,
			};
		default:
			return { $kind: 'unknown' };
	}
}
