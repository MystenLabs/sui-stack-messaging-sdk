import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import { MessagingCompatibleClient } from '../src/types';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { MessagingClient } from '../src/client';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiGrpcClient } from '@mysten/sui-grpc';
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';
import {GenericContainer, StartedTestContainer} from "testcontainers";
import path from 'path';

describe('Integration tests - Read Path', () => {

  const resourcesPath = path.resolve(__dirname, 'resources');

  const DEFAULT_GRAPHQL_URL = 'http://127.0.0.1:9125';

  let jsonRpcNodeContainer: StartedTestContainer;

  let suiJsonRpcClient: MessagingCompatibleClient;
  // @ts-ignore todo: remove when support added
  let suiGraphQLClient: MessagingCompatibleClient;
  // @ts-ignore todo: remove when support added
  let suiGrpcClient: MessagingCompatibleClient;

  beforeAll(async () => {
    jsonRpcNodeContainer = await new GenericContainer("wiremock/wiremock:latest")
      .withExposedPorts({container: 8080, host: 9000})
      .withBindMounts([
        {source: path.join(resourcesPath, "wiremock/jsonrpc/extensions"), target: "/var/wiremock/extensions", mode: "ro"},
        {source: path.join(resourcesPath, "wiremock/jsonrpc/__files"), target: "/home/wiremock/__files", mode: "ro"},
        {source: path.join(resourcesPath, "wiremock/jsonrpc/mappings"), target: "/home/wiremock/mappings", mode: "ro"}
      ])
      .start();
    suiJsonRpcClient = new SuiClient({ url: getFullnodeUrl('localnet') });
    suiGraphQLClient = new SuiGraphQLClient({ url: DEFAULT_GRAPHQL_URL });
    suiGrpcClient = new SuiGrpcClient({
      network: 'localnet',
      transport: new GrpcWebFetchTransport({ baseUrl: 'http://127.0.0.1:9000' }),
    });
  });

  afterAll(async () => {
    await jsonRpcNodeContainer.stop();
  });

  it('test: Fetch channel memberships - json rpc client extension', { timeout: 12000 }, async () => {
    const client = suiJsonRpcClient.$extend(
      MessagingClient.experimental_asClientExtension({
        packageConfig: {
          packageId: '0x4e2d2aa45a092cdc9974d826619f08658b0408b898f9039b46113e0f6756b172',
          memberCapType:
            '0x4e2d2aa45a092cdc9974d826619f08658b0408b898f9039b46113e0f6756b172::channel::MemberCap',
        },
      }),
    );

    let hasNextPage = true;
    let cursor = null;
    const data = [];

    while (hasNextPage) {
      const result = await client.messaging.fetchChannelMemberships({
        address: '0xa7536c86055012cb7753fdb08ecb6c8bf1eb735ad75a2e1980309070123d5ef6',
        cursor,
        limit: 1,
      });
      data.push(...result.objects);
      hasNextPage = result.hasNextPage;
      cursor = result.cursor;
    }

    let expectedCount = 2;

    expect(data.length).toBe(expectedCount);
    expect(data[0].id).toBe('0x677f7705b7cb2f20da38233adc36c13294b257cdbba4f14d739bfae06964db47');
    expect(data[1].id).toBe('0x7bcf40fa4389c0a99d4ce0b281a4ba2c6e05843ebaf0e13ee831a38b5a269a3f');
  });

  it('test: Fetch channel memberships - json rpc client', async () => {
    const client = new MessagingClient({
      suiClient: suiJsonRpcClient,
      packageConfig: {
        packageId: '0x4e2d2aa45a092cdc9974d826619f08658b0408b898f9039b46113e0f6756b172',
        memberCapType:
          '0x4e2d2aa45a092cdc9974d826619f08658b0408b898f9039b46113e0f6756b172::channel::MemberCap',
      },
    });
    let hasNextPage = true;
    let cursor = null;
    const data = [];

    while (hasNextPage) {
      const result = await client.fetchChannelMemberships({
        address: '0xa7536c86055012cb7753fdb08ecb6c8bf1eb735ad75a2e1980309070123d5ef6',
        cursor,
        limit: 1,
      });
      data.push(...result.objects);
      hasNextPage = result.hasNextPage;
      cursor = result.cursor;
    }

    let expectedCount = 2;

    expect(data.length).toBe(expectedCount);
    expect(data[0].id).toBe('0x677f7705b7cb2f20da38233adc36c13294b257cdbba4f14d739bfae06964db47');
    expect(data[1].id).toBe('0x7bcf40fa4389c0a99d4ce0b281a4ba2c6e05843ebaf0e13ee831a38b5a269a3f');
  });

  // todo
  // it('graphQL client extension', {timeout: 12000}, async () => {
  //   const client = suiGraphQLClient.$extend(
  //     MessagingClient.experimental_asClientExtension({}),
  //   );
  //
  //   await expect(client.messaging.fetchChannelMemberships("0xA")).rejects.toThrow(NotImplementedFeatureError);
  // });
  //
  // it('grpc client extension', {timeout: 12000}, async () => {
  //   const client = suiGrpcClient.$extend(
  //     MessagingClient.experimental_asClientExtension({}),
  //   );
  //
  //   await expect(client.messaging.fetchChannelMemberships("0xA")).rejects.toThrow(NotImplementedFeatureError);
  // });

  // todo
  // it('test: Fetch channel memberships - grpc client', async () => {
  //   const client = new MessagingClient({
  //     suiClient: suiGrpcClient,
  //     packageConfig: {
  //       packageId: "0x4e2d2aa45a092cdc9974d826619f08658b0408b898f9039b46113e0f6756b172",
  //       memberCapType: "0x4e2d2aa45a092cdc9974d826619f08658b0408b898f9039b46113e0f6756b172::channel::MemberCap",
  //     }
  //   });
  //   let hasNextPage = true;
  //   let cursor = null;
  //   const data = [];
  //
  //   while (hasNextPage) {
  //     const result = await client.fetchChannelMemberships({
  //       address: "0xa7536c86055012cb7753fdb08ecb6c8bf1eb735ad75a2e1980309070123d5ef6",
  //       cursor,
  //       limit: 1,
  //     });
  //     data.push(...result.objects);
  //     hasNextPage = result.hasNextPage;
  //     cursor = result.cursor;
  //   }
  //
  //   let expectedCount = 2;
  //
  //   expect(data.length).toBe(expectedCount);
  //   expect(data[0].id).toBe("0x677f7705b7cb2f20da38233adc36c13294b257cdbba4f14d739bfae06964db47");
  //   expect(data[1].id).toBe("0x7bcf40fa4389c0a99d4ce0b281a4ba2c6e05843ebaf0e13ee831a38b5a269a3f");
  // });
});
