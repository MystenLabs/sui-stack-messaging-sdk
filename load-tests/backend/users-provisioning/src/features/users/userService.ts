import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import type {
  FundingAccount,
  FundingConfig,
  FundingResult,
  GeneratedUser,
  User,
  UserVariant,
} from "../../core/types.js";
import { fromBase64 } from "@mysten/sui/utils";
import { config } from "../../appConfig.js";

/**
 * Service for handling Sui user generation and management
 */
export class SuiUserService {
  private suiClient: SuiClient;

  constructor() {
    // Initialize SuiClient with testnet
    this.suiClient = new SuiClient({ url: config.suiFullNode });
  }

  /**
   * Generates a new Sui user with a keypair and address
   */
  generateUser(userType: UserVariant): GeneratedUser {
    const keypair = Ed25519Keypair.generate();
    const sui_address = keypair.getPublicKey().toSuiAddress();
    const secret_key = Buffer.from(keypair.getSecretKey()).toString("base64");

    return {
      sui_address,
      secret_key,
      user_variant: userType,
    };
  }

  /**
   * Funds a batch of users from a funding account
   * @param users The users to fund
   * @param fundingAccount The account to fund from
   * @param config Funding configuration
   * @param force Force fund even if user is already funded
   * @returns Result of the funding operation
   */
  async fundUsers(
    users: Omit<User, "secret_key">[],
    fundingAccount: FundingAccount,
    config: FundingConfig,
    force: boolean = false
  ): Promise<FundingResult> {
    const result: FundingResult = {
      successCount: 0,
      failedCount: 0,
      totalFunded: BigInt(0),
      errors: [],
    };

    // Only fund active users.
    // Fund them if force, or if they aren't funded.
    const usersToFund = users.filter((user) => {
      const isActive = user.user_variant === "active";
      if (!isActive) return false;

      return force || !user.is_funded;
    });

    if (usersToFund.length === 0) {
      return result;
    }

    const senderKeypair = Ed25519Keypair.fromSecretKey(
      fromBase64(fundingAccount.secret_key)
    );

    // Process users in batches
    for (let i = 0; i < usersToFund.length; i += config.maxUsersPerBatch) {
      const batch = usersToFund.slice(i, i + config.maxUsersPerBatch);
      try {
        const tx = this.createFundingTransaction(
          batch.map((u) => u.sui_address),
          config.amountPerUser
        );

        // Sign and execute the transaction
        const response = await this.suiClient.signAndExecuteTransaction({
          transaction: tx,
          signer: senderKeypair,
          requestType: "WaitForEffectsCert",
        });

        if (response.effects?.status.status === "success") {
          result.successCount += batch.length;
          result.totalFunded += BigInt(batch.length) * config.amountPerUser;
        } else {
          result.failedCount += batch.length;
          result.errors?.push(
            `Batch ${i / config.maxUsersPerBatch + 1} failed: ${
              response.effects?.status.error || "Unknown error"
            }`
          );
        }
      } catch (error: any) {
        result.failedCount += batch.length;
        result.errors?.push(
          `Batch ${i / config.maxUsersPerBatch + 1} failed: ${error.message}`
        );
      }
    }

    return result;
  }

  /**
   * Creates a transaction block for funding multiple users
   */
  private createFundingTransaction(
    addresses: string[],
    amountPerUser: bigint
  ): Transaction {
    const tx = new Transaction();

    // For each address, create a split_and_transfer call
    for (const address of addresses) {
      // Convert address to proper format (without 0x prefix)
      const recipient = tx.pure(
        bcs.string().serialize(address.replace("0x", "")).toBytes()
      );
      const amount = tx.pure(bcs.U64.serialize(amountPerUser).toBytes());

      tx.moveCall({
        target: "0x2::pay::split_and_transfer",
        typeArguments: ["0x2::sui::SUI"],
        arguments: [tx.gas, amount, recipient],
      });
    }

    return tx;
  }
}
