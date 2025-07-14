import type { Database } from "better-sqlite3-multiple-ciphers";
import type { User } from "../../core/types.js";

/**
 * Repository for handling user data persistence
 */
export class UserRepository {
  constructor(private readonly db: Database) {}

  /**
   * Persists a new user in the database
   */
  createUser(user: User): void {
    this.db
      .prepare(
        `INSERT INTO users (sui_address, secret_key, user_type, is_funded) VALUES (?, ?, ?, ?)`
      )
      .run(
        user.sui_address,
        user.secret_key,
        user.user_type,
        user.is_funded ? 1 : 0
      );
  }
}
