import sui from "k6/x/sui";

const packageId = "0xd4dc4bcb395c1406ca865dd6b3a804830786d17fea20a80a3378504009aa265a";
const senderAddress = "0x5f9d00fabbf78417bc1adf3be52adaeea11aa4bea849954bfc653f7c86656273";
const senderMnemonic = "conduct luxury resource artist almost flush miracle gorilla ripple marriage island brain";
const gasCoinId = "0x076eca53880e841684de7e2cdb9fc3a3f2bdcecb69865c6425b4e40cc8b664b8";
const gasBudget = 100000000;
const ATTACHMENT_TYPE = `${packageId}::attachment::Attachment`;

const memberAddresses = [
    "0x44551d4e0f3a10caf91fee644b6b21cec9f14c1d1e2854dae195070542afccf8",
    "0x6421c1b90eeb4b4b088dc7713573373b2134b9c0a5a88355c8ea596d76526e35",
    "0xda750c4e07b177f9bc02166dfe9c7138bb99305e2f6fff3c9c46deb93633cf4e",
    "0xffb9ba52b6a8aa3489a1edcbde91ad22f6f7f440ef25fcdcf70ed18dd61779b9",
    "0x83066f3cc7358cfdb6217bfaed52e48dcb060107d56f89f9a7a21069ea8d94ff",
    "0x7357e22b631626b1d04ca539dedb9428b2b96953e8297722e0a187481dc54182",
    "0xa94d510d7619b781ad8de8a847b8f2a15d6cd2cbe0d274697bc02177d7ffd3c0",
    "0x1670a896ca042c8106b72cf1c3e6dd56a546b56d06047e56e666346e2c9d0cab",
    "0x4cb60331107ef9b2ea31b4e8985f3a57bc39c5b5ea1183edbf69c799934274d2",
];
const client = sui.connect('http://127.0.0.1:9000');

export default function() {
    const txnMeta = sui.moveCall(
        client,
        packageId,
        "api",
        "create_default_channel",
        senderMnemonic,
        gasCoinId,
        [memberAddresses,"0x6"],
        [],
        gasBudget
    );

    console.log("***",txnMeta);

    const resp = sui.signAndExecuteTransactionBlock(
        client,
        senderMnemonic,
        txnMeta
    );

    console.log("***", resp);

    const objectChanges = resp.object_changes;
    const createdObjects = objectChanges.filter((objChng) => objChng.type === "created" && objChng.owner.address_owner !== undefined);
    const sharedObjects = objectChanges.filter((objChng) => objChng.type === "created" && objChng.owner.shared !== undefined);

    const channel = sharedObjects.find(shr => shr.object_type.includes("channel::Channel"));
    const memberCaps = createdObjects.filter(crt => crt.object_type.includes("channel::MemberCap"));
    const creatorMemberCap = memberCaps.find(cap => cap.owner.address_owner === senderAddress);

    const channelId = channel.object_id;

    const txnMeta3 = sui.moveCall(
        client,
        packageId,
        "api",
        "send_message",
        senderMnemonic,
        gasCoinId,
        [
            channelId,
            creatorMemberCap.object_id,
            [0,1,2],
            [0,1,2],
            [0,1,2],
            "0x6"
        ],
        [],
        gasBudget,
    );

    console.log("***", txnMeta3);

    const resp2 = sui.signAndExecuteTransactionBlock(
        client,
        senderMnemonic,
        txnMeta3
    );

    console.log("***", resp2);

}