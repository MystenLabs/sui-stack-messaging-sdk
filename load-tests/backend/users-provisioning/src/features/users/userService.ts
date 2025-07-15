import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { GeneratedUser, UserVariant } from "../../core/types.js";

/**
 * Service for handling Sui user generation and management
 */
export class SuiUserService {
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
}
