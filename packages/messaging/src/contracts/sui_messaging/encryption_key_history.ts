/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, MoveTuple } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import * as table_vec from './deps/sui/table_vec.js';
const $moduleName = '@local-pkg/sui-messaging::encryption_key_history';
export const EncryptionKeyHistory = new MoveStruct({ name: `${$moduleName}::EncryptionKeyHistory`, fields: {
        latest: bcs.vector(bcs.u8()),
        latest_version: bcs.u32(),
        history: table_vec.TableVec
    } });
export const EditEncryptionKey = new MoveTuple({ name: `${$moduleName}::EditEncryptionKey`, fields: [bcs.bool()] });