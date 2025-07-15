/**
 * Core types used across the application
 */

export type UserVariant = "active" | "passive";

export interface User {
  sui_address: string;
  secret_key: string;
  user_variant: UserVariant;
  is_funded: boolean;
}

export type GeneratedUser = Omit<User, "is_funded">;

export interface FundingAccount {
  sui_address: string;
  secret_key: string;
}

export interface FundingConfig {
  amountPerUser: bigint; // amount in MIST to send to each user
  maxUsersPerBatch: number; // maximum number of users to fund in a single batch
}

export interface FundingResult {
  successCount: number;
  failedCount: number;
  totalFunded: bigint;
  errors?: string[];
}
