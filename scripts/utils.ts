/* --- Place your @mysten/sui imports here --- */
import { execSync } from "child_process";
import {
  SuiClient,
  SuiObjectChange,
  SuiTransactionBlockResponse,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

export const getActiveAddress = () => {
  return execSync(`sui client active-address`, { encoding: "utf8" }).trim();
};

/**
 * @param {string} base64Sk - The base64 Secret (private) Key
 * @return {Ed25519Keypair} - The Ed25519 Keypair
 */
export const createKeypairFromPrivateKey = (
  base64Sk: string
): Ed25519Keypair => {
  const { secretKey } = decodeSuiPrivateKey(base64Sk);
  return Ed25519Keypair.fromSecretKey(secretKey);
};

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

  await client.waitForTransaction({ digest: txResult.digest });
  return txResult;
}
