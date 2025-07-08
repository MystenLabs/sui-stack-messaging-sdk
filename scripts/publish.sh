#!/bin/bash

set -e

# dir of smart contract
MOVE_PACKAGE_DIR="../move/sui_messaging"
PUBLISH_GAS_BUDGET=1000000000

# check this is being ran from the right path
if [[ "$PWD" != *"/scripts" ]]; then
  echo "Please cd to ./scripts and then run this"
  exit 0
fi

# check dependencies are available
for dep in jq curl sui; do
  if !command -V ${i} 2>/dev/null; then
    echo "Please intall lib ${dep}"
    exit 1
  fi
done

NETWORK_ALIAS=$(sui client active-env)
ENVS_JSON=$(sui client envs --json)
FULLNODE_URL=$(echo $ENVS_JSON | jq -r --arg alias $NETWORK_ALIAS '.[0][] | select(.alias == $alias).rpc')
ADDRESSES=$(sui client addresses --json)

echo "Checking if sui-messaging-admin address is available"
HAS_ADMIN=$(echo "$ADDRESSES" | jq -r '.addresses | map(contains(["sui-messaging-admin"])) | any')
if [ "$HAS_ADMIN" = "false" ]; then
	echo "Did not find 'sui-messaging-admin' in the ADDRESSES. Creating one and requesting tokens."
	sui client new-address ed25519 sui-messaging-admin
fi

echo "Switching to sui-messaging-admin address"
sui client switch --address sui-messaging-admin

echo "Checking if enough GAS is available for sui-messaging-admin"
GAS=$(sui client gas --json)
AVAILABLE_GAS=$(echo "$GAS" | jq --argjson min_gas $PUBLISH_GAS_BUDGET '.[] | select(.mistBalance > $min_gas).gasCoinId')
if [ -z "$AVAILABLE_GAS" ]; then
	echo "Not enough GAS to deploy contract, requesting from faucet"
	sui client faucet
	# If NETWORK_ALIAS is localnet wait 2 sec
	if [ "$NETWORK_ALIAS" == "localnet" ] || [ "$NETWORK_ALIAS" == "local" ]; then
		sleep 2
	else
		echo "Please try again after some time."
		exit 1
	fi
fi

WITH_UNPUBLISHED_DEPENDENCIES=""
if [ "$NETWORK_ALIAS" == "devnet" ] || [ "$NETWORK_ALIAS" == "local" ] || [ "$NETWORK_ALIAS" == "localnet" ]; then
	WITH_UNPUBLISHED_DEPENDENCIES="--with-unpublished-dependencies"
fi

# Do actual puslish
echo "Publishing"
PUBLISH_RES=$(sui client publish --skip-dependency-verification ${WITH_UNPUBLISHED_DEPENDENCIES} --json ${MOVE_PACKAGE_DIR})

echo "Writing publish result to .publish.res.json"
echo ${PUBLISH_RES} >.publish.res.json

# Check if the command succeeded (exit status 0) and for success in text
if [[ "$PUBLISH_RES" =~ "error" && "$PUBLISH_RES" != *"success"* ]]; then
	# If yes, print the error message and exit the script
	echo "Error during move contract publishing. Details : $PUBLISH_RES"
	exit 1
fi

# Publish success
echo "Publish successful"
echo "Creating new env variables"
PUBLISH_OBJECTS=$(echo "$PUBLISH_RES" | jq -r '.objectChanges[] | select(.type == "published")')
PACKAGE_ID=$(echo "$PUBLISH_OBJECTS" | jq -r '.packageId')
CREATED_OBJS=$(echo "$PUBLISH_RES" | jq -r '.objectChanges[] | select(.type == "created")')
UPGRADE_CAP=$(echo "$CREATED_OBJS" | jq -r 'select (.objectType == "0x2::package::UpgradeCap").objectId')
PUBLISHER=$(echo "$CREATED_OBJS" | jq -r 'select (.objectType == "0x2::package::Publisher").objectId')
ADMIN=$(sui client active-address)

EXPORT_RESP=$(sui keytool export --key-identity $ADMIN --json)
ADMIN_PRIVATE_KEY=$(echo "$EXPORT_RESP" | jq -r '.exportedPrivateKey')

echo "Publish new env var to scripts/.env: "
echo "FULLNODE_URL=$FULLNODE_URL"
echo "PACKAGE_ADDRESS=$PACKAGE_ID"
echo "ADMIN_ADDRESS=$ADMIN"

cat >.env <<-API_ENV
	FULLNODE_URL=$FULLNODE_URL
	PACKAGE_ID=$PACKAGE_ID
	PUBLISHER=$PUBLISHER
	UPGRADE_CAP=$UPGRADE_CAP
	ADMIN_PRIVATE_KEY=$ADMIN_PRIVATE_KEY
API_ENV

echo "Done - Proceed to run the setup scripts"