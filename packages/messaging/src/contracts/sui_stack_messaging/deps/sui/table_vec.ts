// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** A basic scalable vector library implemented using `Table`. */

import { MoveStruct } from '../../../utils/index.js';
import * as table from './table.js';
const $moduleName = '0x2::table_vec';
export const TableVec = new MoveStruct({
	name: `${$moduleName}::TableVec`,
	fields: {
		/** The contents of the table vector. */
		contents: table.Table,
	},
});
