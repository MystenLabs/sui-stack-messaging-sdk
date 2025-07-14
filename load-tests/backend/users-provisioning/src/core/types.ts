/**
 * Core types used across the application
 */

export type UserVariant = "active" | "passive";

export interface User {
  sui_address: string;
  secret_key: string;
  user_type: UserVariant;
  is_funded: boolean;
}

export type GeneratedUser = Omit<User, "is_funded">;
