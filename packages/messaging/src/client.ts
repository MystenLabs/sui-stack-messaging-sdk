import {ChannelMembershipsRequest, MessagingCompatibleClient, MessagingPackageConfig} from "./types";
import {MAINNET_MESSAGING_PACKAGE_CONFIG, TESTNET_MESSAGING_PACKAGE_CONFIG} from "./constants";
import {MessagingError} from "./error";

export interface MessagingClientExtensionOptions {
  packageConfig?: MessagingPackageConfig;
  network?: 'mainnet' | 'testnet';
}

export interface MessagingClientOptions extends MessagingClientExtensionOptions {
  suiClient: MessagingCompatibleClient;
}

export class MessagingClient {
  #suiClient: MessagingCompatibleClient;
  #packageConfig: MessagingPackageConfig;

  constructor(public options: MessagingClientOptions) {
    this.#suiClient = options.suiClient;

    if (options.network && !options.packageConfig) {
      const network = options.network;
      switch (network) {
        case 'testnet':
          this.#packageConfig = TESTNET_MESSAGING_PACKAGE_CONFIG;
          break;
        case 'mainnet':
          this.#packageConfig = MAINNET_MESSAGING_PACKAGE_CONFIG;
          break;
        default:
          throw new MessagingError(`Unsupported network: ${network}`);
      }
    } else {
      this.#packageConfig = options.packageConfig!;
    }
  }

  static experimental_asClientExtension(options: MessagingClientExtensionOptions) {
    return {
      name: 'messaging' as const,
      register: (client: MessagingCompatibleClient) => {
        return new MessagingClient({
          suiClient: client,
          ...options
        });
      },
    };
  }

  // ===== Read Path =====

  async fetchChannelMemberships(request: ChannelMembershipsRequest) {
    return this.#suiClient.core.getOwnedObjects({
      ...request,
      type: this.#packageConfig.memberCapType,
    });
  }

  // ===== Write Path =====
}