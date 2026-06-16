#!/bin/bash

set -e

# Used to release langium-ai, and run some preflight release checks as well
echo ""
echo "* Release Script for the Langium AI CLI (lai)"
echo ""
echo "* Double check that you've done everything in RELEASE.md. Hit enter to continue."
read -r

cd ./packages/cli/

# run auto audit & fix
npm audit
npm audit fix

echo ""
echo "* Audit auto-applied, verify there are no changes that need to be applied before proceeding. Enter to continue."
read -r

# read version from package.json using jq
VERSION=$(jq -r '.version' package.json)
echo "* Read version from package.json: ${VERSION}"

# update the LAI_CUR_VERSION line in index.ts to match package.json
sed -i '' "s/const LAI_CUR_VERSION = '.*';/const LAI_CUR_VERSION = '${VERSION}';/" ./src/index.ts
echo "* Updated LAI_CUR_VERSION in ./src/index.ts to '${VERSION}'"

echo ""
echo "* Verify the version looks correct before proceeding. Enter to continue."
read -r

echo "* Cleaning & Rebuilding"
npm run clean
npm run build

echo "* Running tests to verify all is OK"
# just verify we didn't break something
npm test

echo ""
read -r -p "* Run 'npm login' before continuing? [Y/n] " LOGIN_ANSWER
if [[ ! "${LOGIN_ANSWER}" =~ ^[Nn]$ ]]; then
    npm login
fi

npm publish --dry-run

echo ""
echo "* Verify dry run output. Good to continue? Enter to continue."
read -r

npm publish

echo ""
echo "* Publish complete! Version ${VERSION} has been released."