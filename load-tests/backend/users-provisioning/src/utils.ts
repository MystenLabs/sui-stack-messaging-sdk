/* --- Place your @mysten/sui imports here --- */
import type { SuiTransactionBlockResponse } from "@mysten/sui/client";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

/**
 * @param {SuiClient} client - The SuiClient instance
 * @param {Transaction} transaction - The Transaction instance
 * @param {Ed25519Keypair} signer - The Keypair signer
 * @return {Promise<SuiTransactionBlockResponse>}
 */
export async function executeTransaction(
  client: SuiClient,
  transaction: Transaction,
  signer: Ed25519Keypair
): Promise<SuiTransactionBlockResponse> {
  const txResult = await client.signAndExecuteTransaction({
    transaction,
    signer,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  // await client.waitForTransaction({ digest: txResult.digest });
  return txResult;
}
