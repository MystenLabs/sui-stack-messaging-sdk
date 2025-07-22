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
import {
  UserRepository,
  type UserQueryParams,
  type PaginatedResponse,
} from "./userRepository.js";

/**
 * Service for handling Sui user generation and management
 */
export class SuiUserService {
  private suiClient: SuiClient;
  private userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    // Initialize SuiClient with testnet
    this.suiClient = new SuiClient({ url: config.suiFullNode });
    this.userRepository = userRepository;
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
   * Creates multiple users and persists them to the database
   * @param userVariant The type of users to generate
   * @param count Number of users to generate
   * @returns Information about the created users (without sensitive data)
   */
  createUsers(
    userVariant: UserVariant,
    count: number
  ): {
    message: string;
    users: Array<{ sui_address: string; user_variant: UserVariant }>;
  } {
    // Validate batch size
    if (
      count < config.userGeneration.minBatchSize ||
      count > config.userGeneration.maxBatchSize
    ) {
      throw new Error(
        `Invalid count. Must be a number between ${config.userGeneration.minBatchSize} and ${config.userGeneration.maxBatchSize}`
      );
    }

    // Generate all users first
    const generatedUsers = Array.from({ length: count }, () => ({
      ...this.generateUser(userVariant),
      is_funded: false,
    }));

    // Insert all users in a single transaction
    const insertedCount = this.userRepository.createUsers(generatedUsers);

    // Prepare response without sensitive data
    const usersResponse = generatedUsers.map((user) => ({
      sui_address: user.sui_address,
      user_variant: user.user_variant,
    }));

    return {
      message: `${insertedCount} ${userVariant} user(s) generated.`,
      users: usersResponse,
    };
  }

  /**
   * Retrieves users with filtering and pagination
   * @param params Query parameters for filtering and pagination
   * @returns Paginated list of users (without sensitive data)
   */
  getUsers(
    params: UserQueryParams = {}
  ): PaginatedResponse<Omit<User, "secret_key">> {
    return this.userRepository.getUsers(params);
  }

  /**
   * Retrieves users with secrets (FOR LOAD TESTING ONLY)
   * @param params Query parameters for filtering and pagination
   * @returns Paginated list of users with secret keys
   */
  getUsersWithSecrets(params: UserQueryParams = {}): PaginatedResponse<User> {
    return this.userRepository.getUsersWithSecrets(params);
  }

  /**
   * Funds unfunded active users from a funding account
   * @param fundingAccount The account to fund from
   * @param amountPerUser Amount to fund each user
   * @returns Result of the funding operation
   */
  async fundUnfundedActiveUsers(
    fundingAccount: FundingAccount,
    amountPerUser: bigint
  ): Promise<{
    message: string;
    fundingResult: {
      successCount: number;
      failedCount: number;
      totalFunded: string;
      errors?: string[];
    };
  }> {
    // Get unfunded active users
    const users = this.userRepository.getUsers({
      variant: "active",
      limit: 200,
    });

    if (users.items.length === 0) {
      return {
        message: "No unfunded active users found",
        fundingResult: {
          successCount: 0,
          failedCount: 0,
          totalFunded: "0",
        },
      };
    }

    const fundingConfig = {
      amountPerUser,
      maxUsersPerBatch: config.maxFundingBatchSize,
    };

    try {
      const result = await this.fundUsers(
        users.items,
        fundingAccount,
        fundingConfig,
        true
      );

      // Update funded status for successful transfers
      if (result.successCount > 0) {
        const fundedAddresses = users.items
          .slice(0, result.successCount)
          .map((u) => u.sui_address);

        this.userRepository.markAsFunded(fundedAddresses);
      }

      return {
        message: `Funding complete. ${result.successCount} users funded, ${result.failedCount} failed.`,
        fundingResult: {
          ...result,
          totalFunded: result.totalFunded.toString(),
        },
      };
    } catch (error: any) {
      throw new Error(`Funding failed: ${error.message}`);
    }
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
      fundingAccount.secret_key
    );

    // Process users in batches
    console.log("*** usersToFund:", usersToFund.length);
    console.log("*** config.maxUsersPerBatch:", config.maxUsersPerBatch);

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
          options: {
            showEffects: true,
            showObjectChanges: true,
          },
        });

        await this.suiClient.waitForTransaction({ digest: response.digest });

        if (response.effects?.status.status === "success") {
          result.successCount += batch.length;
          result.totalFunded += BigInt(batch.length) * config.amountPerUser;
        } else {
          console.error("Transaction failed:", response);
          result.failedCount += batch.length;
          if (!result.errors) result.errors = [];
          result.errors.push(
            `Batch ${i / config.maxUsersPerBatch + 1} failed: ${
              response.effects?.status.error || "Unknown error"
            }`
          );
        }
      } catch (error: any) {
        console.error("Transaction failed:", error);
        result.failedCount += batch.length;
        if (!result.errors) result.errors = [];
        result.errors.push(
          `Batch ${i / config.maxUsersPerBatch + 1} failed: ${error.message}`
        );
      }
    }

    return result;
  }

  /**
   * Creates a transaction block for funding multiple users efficiently.
   */
  private createFundingTransaction(
    addresses: string[],
    amountPerUser: bigint
  ): Transaction {
    const tx = new Transaction();

    // Set a reasonable gas budget.
    // const gasPerTransfer = 5_000_000;
    // tx.setGasBudget(gasPerTransfer * addresses.length + 10_000_000);

    // 1. Create an array of u64 amounts, one for each recipient.
    const amounts = addresses.map(() => tx.pure.u64(amountPerUser));

    // 2. Split the gas coin into multiple new coins in a single command.
    //    This returns an array of the newly created coin objects.
    const coins = tx.splitCoins(tx.gas, amounts);

    // 3. Loop through the recipients and transfer one coin to each.
    addresses.forEach((recipient, index) => {
      tx.transferObjects(
        [coins[index]], // The coin to send (as an array)
        tx.pure.address(recipient) // The recipient's address
      );
    });

    return tx;
  }
}
