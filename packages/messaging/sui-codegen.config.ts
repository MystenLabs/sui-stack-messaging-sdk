// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiCodegenConfig } from "@mysten/codegen";

const config: SuiCodegenConfig = {
  output: "./src/contracts",
  packages: [
    {
      package: "@local-pkg/sui_messaging",
      path: "../../move/sui_messaging",
    },
  ],
};

export default config;
