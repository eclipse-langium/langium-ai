#!/bin/bash

# read version from package.json using jq
VERSION=$(jq -r '.version' ./packages/cli/package.json)
echo "* Read version from package.json: ${VERSION}"

# update the LAI_CUR_VERSION line in index.ts to match package.json
sed -i '' "s/const LAI_CUR_VERSION = '.*';/const LAI_CUR_VERSION = '${VERSION}';/" ./packages/cli/src/index.ts
echo "* Updated LAI_CUR_VERSION in ./packages/cli/src/index.ts to '${VERSION}'"