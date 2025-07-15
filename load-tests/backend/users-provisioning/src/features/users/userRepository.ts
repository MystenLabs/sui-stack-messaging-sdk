import type { Database } from "better-sqlite3-multiple-ciphers";
import type { User } from "../../core/types.js";

/**
 * Repository for handling user data persistence
 */
export class UserRepository {
  private readonly insertStatement: ReturnType<Database["prepare"]>;
  private readonly selectStatement: ReturnType<Database["prepare"]>;
  private readonly countStatement: ReturnType<Database["prepare"]>;
  private readonly updateFundedStatement: ReturnType<Database["prepare"]>;
  private readonly DEFAULT_LIMIT = 50;
  private readonly MAX_LIMIT = 100;

  constructor(private readonly db: Database) {
    // Prepare statements once during initialization
    this.insertStatement = this.db.prepare(
      `INSERT INTO users (sui_address, secret_key, user_variant, is_funded) VALUES (@sui_address, @secret_key, @user_variant, @is_funded)`
    );

    this.selectStatement = this.db.prepare(
      `SELECT sui_address, user_variant, is_funded 
       FROM users
       WHERE (@user_variant IS NULL OR user_variant = @user_variant)
       AND (@is_funded IS NULL OR is_funded = @is_funded)
       ORDER BY id DESC
       LIMIT @limit OFFSET @offset`
    );

    this.countStatement = this.db.prepare(
      `SELECT COUNT(*) as count
       FROM users
       WHERE (@user_variant IS NULL OR user_variant = @user_variant)
       AND (@is_funded IS NULL OR is_funded = @is_funded)`
    );

    this.updateFundedStatement = this.db.prepare(
      `UPDATE users SET is_funded = 1 WHERE sui_address IN (select value from json_each(?))`
    );
  }

  /**
   * Persists a new user in the database
   */
  createUser(user: User): void {
    this.insertStatement.run({
      sui_address: user.sui_address,
      secret_key: user.secret_key,
      user_variant: user.user_variant,
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
          user_variant: user.user_variant,
          is_funded: user.is_funded ? 1 : 0,
        });
      }
      return users.length;
    });

    return transaction(users);
  }

  /**
   * Fetch users with pagination and filtering
   */
  getUsers(
    params: UserQueryParams = {}
  ): PaginatedResponse<Omit<User, "secret_key">> {
    const limit = Math.min(params.limit || this.DEFAULT_LIMIT, this.MAX_LIMIT);
    const offset = params.offset || 0;

    const queryParams = {
      user_variant: params.variant || null,
      is_funded: params.isFunded === undefined ? null : params.isFunded ? 1 : 0,
      limit,
      offset,
    };

    const total = this.countStatement.get(queryParams) as { count: number };
    const items = this.selectStatement.all(queryParams) as Array<
      Omit<User, "secret_key">
    >;

    return {
      items,
      total: total.count,
      limit,
      offset,
    };
  }

  /**
   * Mark multiple users as funded
   * @param addresses Array of sui addresses to mark as funded
   * @returns Number of users updated
   */
  markAsFunded(addresses: string[]): number {
    const result = this.updateFundedStatement.run(JSON.stringify(addresses));
    return result.changes;
  }
}

export interface UserQueryParams {
  variant?: "active" | "passive";
  isFunded?: boolean;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
