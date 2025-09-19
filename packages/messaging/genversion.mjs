#!/usr/bin/env node
// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, writeFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

const versionFileContent = `// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// This file is auto-generated. Do not edit directly.
export const PACKAGE_VERSION = '${packageJson.version}';
export const PACKAGE_NAME = '${packageJson.name}';
`;

writeFileSync('./src/version.ts', versionFileContent);
console.log(`Generated version file with version ${packageJson.version}`);
