import {MessagingPackageConfig} from "./types";

export const TESTNET_MESSAGING_PACKAGE_CONFIG = {
  packageId: '0xTBD',
  memberCapType: '0xTBD::api::MemberCap',
  sealApproveContract: {
    packageId: '0xTBD',
    module: 'seal_policies',
    functionName: 'seal_approve',
  },
  sealSessionKeyTTLmins: 30,
} satisfies MessagingPackageConfig;

export const MAINNET_MESSAGING_PACKAGE_CONFIG = {
  packageId: '0xTBD',
  memberCapType: '0xTBD::api::MemberCap',
  sealApproveContract: {
    packageId: '0xTBD',
    module: 'seal_policies',
    functionName: 'seal_approve',
  },
  sealSessionKeyTTLmins: 30,
} satisfies MessagingPackageConfig;