/* --- Place your @mysten/sui imports here --- */
import { execSync } from "child_process";
import type { ClientWithCoreApi } from "@mysten/sui/client";
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
 * @param {ClientWithCoreApi} client - The Sui client instance
 * @param {Transaction} transaction - The Transaction instance
 * @param {Ed25519Keypair} signer - The Keypair signer
 * @return {Promise<{ digest: string }>}
 */
export async function executeTransaction(
  client: ClientWithCoreApi,
  transaction: Transaction,
  signer: Ed25519Keypair
): Promise<{ digest: string }> {
  const result = await client.core.signAndExecuteTransaction({
    transaction,
    signer,
    include: {
      effects: true,
    },
  });

  if (result.$kind === "FailedTransaction") {
    throw new Error(
      `Transaction failed: ${JSON.stringify(
        result.FailedTransaction.status.error
      )}`
    );
  }

  await client.core.waitForTransaction({
    digest: result.Transaction.digest,
  });
  return { digest: result.Transaction.digest };
}
