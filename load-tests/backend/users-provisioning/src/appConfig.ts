import { mkdir } from "fs/promises";
import path from "path";
import "dotenv/config";
import { DbKeyManager } from "./dbKeyManager.js";

/**
 * A singleton class to manage all application configurations.
 * It loads environment variables, provides default values,
 * and uses DbKeyManager for handling the database encryption key.
 */
class AppConfig {
  private static instance: AppConfig;

  public readonly dbEncryptionKey: string;
  public readonly dbFile: string;
  public readonly port: number;
  public readonly userGeneration = {
    maxBatchSize: 100,
    minBatchSize: 1,
    defaultBatchSize: 1,
  };

  private constructor() {
    // 1. Use your DbKeyManager to handle the encryption key.
    // This ensures a key exists and loads it.
    DbKeyManager.initializeKey();
    this.dbEncryptionKey = DbKeyManager.getKey();

    // 2. Load and validate other configurations from .env
    this.dbFile = this.getEnvVariable("DB_FILE", "./data/users.db");

    // Ensure database directory exists
    this.ensureDbDirectoryExists();

    const portStr = this.getEnvVariable("PORT", "4321");
    this.port = parseInt(portStr, 10);

    // 3. Load user generation limits
    this.userGeneration.maxBatchSize = parseInt(
      this.getEnvVariable("MAX_BATCH_SIZE", "100"),
      10
    );
    this.userGeneration.minBatchSize = parseInt(
      this.getEnvVariable("MIN_BATCH_SIZE", "1"),
      10
    );
    this.userGeneration.defaultBatchSize = parseInt(
      this.getEnvVariable("DEFAULT_BATCH_SIZE", "1"),
      10
    );

    if (isNaN(this.port)) {
      throw new Error(
        `Invalid PORT specified in .env file. Must be a number. Got: ${portStr}`
      );
    }
  }

  /**
   * Retrieves an environment variable, falling back to a default if not set.
   */
  private getEnvVariable(key: string, defaultValue: string): string {
    const value = process.env[key];
    if (!value) {
      console.warn(
        `[Config] Environment variable ${key} not found. Using default value: "${defaultValue}"`
      );
      return defaultValue;
    }
    return value;
  }

  /**
   * Gets the singleton instance of the AppConfig.
   */
  public static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }

  /**
   * Ensures the database directory exists, creating it if necessary
   */
  private ensureDbDirectoryExists(): void {
    const dbDir = path.dirname(this.dbFile);
    mkdir(dbDir, { recursive: true }).catch((err) => {
      console.error(`Failed to create database directory: ${err.message}`);
      process.exit(1);
    });
  }
}

// Export a single, immutable instance for the rest of the app to use.
export const config = AppConfig.getInstance();
