// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { getLogger as getLogTapeLogger } from '@logtape/logtape';

/**
 * Get a logger for the specified category.
 *
 * This is a thin wrapper around LogTape's getLogger function.
 * Use the CATEGORIES constants for consistency.
 *
 * @param category - The logging category (use CATEGORIES constants)
 * @returns A logger instance
 *
 * @example
 * ```typescript
 * import { getLogger, LOG_CATEGORIES } from './logging/index.js';
 *
 * const logger = getLogger(LOG_CATEGORIES.CLIENT_READS);
 * logger.info("Fetching channels", { count: 10 });
 * ```
 */
export function getLogger(category: readonly string[]) {
	return getLogTapeLogger(category);
}

export { LOG_CATEGORIES } from './categories.js';
