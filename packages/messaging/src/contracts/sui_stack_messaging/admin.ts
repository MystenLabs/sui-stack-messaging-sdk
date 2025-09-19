// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Package-level Admin features: Change package version Change Channel object's
 * version Change limit constants
 */

import { MoveTuple } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
const $moduleName = '@local-pkg/sui-stack-messaging::admin';
export const Admin = new MoveTuple({ name: `${$moduleName}::Admin`, fields: [bcs.bool()] });
