import type { Database } from "better-sqlite3-multiple-ciphers";
import type { User } from "../../core/types.js";

/**
 * Repository for handling user data persistence
 */
export class UserRepository {
  private readonly insertStatement: ReturnType<Database["prepare"]>;

  constructor(private readonly db: Database) {
    // Prepare the insert statement once during initialization
    this.insertStatement = this.db.prepare(
      `INSERT INTO users (sui_address, secret_key, user_type, is_funded) VALUES (@sui_address, @secret_key, @user_type, @is_funded)`
    );
  }

  /**
   * Persists a new user in the database
   */
  createUser(user: User): void {
    this.insertStatement.run({
      sui_address: user.sui_address,
      secret_key: user.secret_key,
      user_type: user.user_type,
      is_funded: user.is_funded ? 1 : 0,
    });
  }

  /**
   * Efficiently persists multiple users in a single transaction
   * @param users Array of users to persist
   * @returns number of users inserted
   */
  createUsers(users: User[]): number {
    const transaction = this.db.transaction((users: User[]) => {
      for (const user of users) {
        this.insertStatement.run({
          sui_address: user.sui_address,
          secret_key: user.secret_key,
          user_type: user.user_type,
          is_funded: user.is_funded ? 1 : 0,
        });
      }
      return users.length;
    });

    return transaction(users);
  }
}
