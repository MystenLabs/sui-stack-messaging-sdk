import * as crypto from "crypto";
import * as fs from "fs";
import * as dotenv from "dotenv";

export class DbKeyManager {
  private static readonly ENV_FILE = ".env";
  private static readonly KEY_NAME = "DB_ENCRYPTION_KEY";
  private static readonly KEY_LENGTH = 32; // 256 bits

  /**
   * Generates a cryptographically secure random key
   */
  private static generateSecureKey(): string {
    return crypto.randomBytes(this.KEY_LENGTH).toString("hex");
  }

  /**
   * Reads the existing .env file and returns its content as key-value pairs
   */
  private static parseEnvFile(): Record<string, string> {
    if (!fs.existsSync(this.ENV_FILE)) {
      return {};
    }

    // Parse the .env file using dotenv
    const result = dotenv.config({ path: this.ENV_FILE });

    if (result.error) {
      throw new Error(`Error parsing .env file: ${result.error.message}`);
    }

    return result.parsed || {};
  }

  /**
   * Safely updates a single key in the .env file while preserving formatting and comments
   */
  private static updateEnvKey(key: string, value: string): void {
    let envContent = "";
    let envLines: string[] = [];

    // Read existing content if file exists
    if (fs.existsSync(this.ENV_FILE)) {
      try {
        envContent = fs.readFileSync(this.ENV_FILE, "utf-8");
        envLines = envContent.split("\n");
      } catch (error) {
        throw new Error(
          `Error reading .env file: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    // Parse the current content to understand existing keys
    const currentParsed = envContent ? dotenv.parse(envContent) : {};

    // Check if key already exists in the parsed content
    const keyExists = key in currentParsed;

    if (keyExists) {
      // Find and update the existing key line
      let keyUpdated = false;

      for (let i = 0; i < envLines.length; i++) {
        const line = envLines[i];

        // Skip comments and empty lines
        if (line.trim().startsWith("#") || line.trim() === "") {
          continue;
        }

        // Parse just this line to see if it contains our key
        try {
          const lineParsed = dotenv.parse(line);
          if (key in lineParsed) {
            // Replace the entire line with the new key-value pair
            envLines[i] = `${key}=${value}`;
            keyUpdated = true;
            break;
          }
        } catch {
          // If line can't be parsed, check with simple string matching as fallback
          const [lineKey] = line.split("=", 1);
          if (lineKey?.trim() === key) {
            envLines[i] = `${key}=${value}`;
            keyUpdated = true;
            break;
          }
        }
      }

      if (!keyUpdated) {
        throw new Error(
          `Key ${key} exists in parsed content but couldn't be found in file lines`
        );
      }

      envContent = envLines.join("\n");
    } else {
      // Key doesn't exist, append it
      if (envContent && !envContent.endsWith("\n")) {
        envContent += "\n";
      }
      envContent += `${key}=${value}\n`;
    }

    // Write the updated content with restrictive permissions
    try {
      fs.writeFileSync(this.ENV_FILE, envContent, { mode: 0o600 });
    } catch (error) {
      throw new Error(
        `Error writing .env file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    // Verify the update was successful by parsing the result
    try {
      const updatedContent = fs.readFileSync(this.ENV_FILE, "utf-8");
      const updatedParsed = dotenv.parse(updatedContent);

      if (updatedParsed[key] !== value) {
        throw new Error(
          `Key update verification failed: expected ${value}, got ${updatedParsed[key]}`
        );
      }
    } catch (error) {
      throw new Error(
        `Error verifying .env file update: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Generates a new encryption key and saves it to .env
   * Will not overwrite existing key unless force is true
   */
  public static generateAndSaveKey(force: boolean = false): string {
    const envVars = this.parseEnvFile();

    // Check if key already exists
    if (envVars[this.KEY_NAME] && !force) {
      console.warn(
        `Key ${this.KEY_NAME} already exists in .env. Use force=true to overwrite.`
      );
      return envVars[this.KEY_NAME];
    }

    // Generate new key
    const newKey = this.generateSecureKey();

    // Update just this key in the .env file
    this.updateEnvKey(this.KEY_NAME, newKey);

    // Set restrictive permissions on .env file (Unix-like systems)
    try {
      fs.chmodSync(this.ENV_FILE, 0o600);
    } catch (error) {
      console.warn(
        "Could not set restrictive permissions on .env file:",
        error
      );
    }

    console.log(
      `Database encryption key ${
        force ? "regenerated" : "generated"
      } and saved to .env`
    );
    return newKey;
  }

  /**
   * Reads the encryption key from .env file
   * Throws an error if the key is not found
   */
  public static getKey(): string {
    const envVars = this.parseEnvFile();
    const key = envVars[this.KEY_NAME];

    if (!key) {
      throw new Error(
        `Database encryption key not found in .env. Run generateAndSaveKey() first.`
      );
    }

    // Validate key format (should be 64 hex characters for 256-bit key)
    if (!/^[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error("Invalid database encryption key format in .env");
    }

    return key;
  }

  /**
   * Checks if a valid encryption key exists in .env
   */
  public static hasValidKey(): boolean {
    try {
      this.getKey();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initializes the key if it doesn't exist, otherwise returns the existing key
   */
  public static initializeKey(): string {
    if (this.hasValidKey()) {
      return this.getKey();
    }
    return this.generateAndSaveKey();
  }

  /**
   * Converts the hex key to a Buffer (useful for better-sqlite3-multiple-ciphers)
   */
  public static getKeyAsBuffer(): Buffer {
    const hexKey = this.getKey();
    return Buffer.from(hexKey, "hex");
  }
}
