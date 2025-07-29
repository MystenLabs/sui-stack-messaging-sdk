import Database from "better-sqlite3-multiple-ciphers";
import { config } from "./appConfig.js";

const db = new Database(config.dbFile, {
  verbose: console.log,
});

// Apply the encryption key using the `hexkey` pragma
db.pragma(`hexkey = '${config.dbEncryptionKey}'`);

// Enable WAL mode for better perfomrmance and concurrency.
db.pragma("journal_mode = WAL");

// Create the Schema
const createTableStmt = `
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sui_address TEXT NOT NULL UNIQUE,
        secret_key TEXT NOT NULL,
        user_variant TEXT NOT NULL CHECK(user_variant IN ('active', 'passive')),
        is_funded BOOLEAN NOT NULL DEFAULT 0
    );
`;
db.exec(createTableStmt);

export default db;
