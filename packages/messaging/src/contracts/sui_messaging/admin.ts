/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * Package-level Admin features: Change package version Change Channel object's
 * version Change limit constants
 */

import { MoveStruct } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
const $moduleName = '@local-pkg/sui_messaging::admin';
export const Admin = new MoveStruct({
  name: `${$moduleName}::Admin`,
  fields: {
    dummy_field: bcs.bool(),
  },
});
