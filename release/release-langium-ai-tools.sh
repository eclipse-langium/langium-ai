#!/bin/bash

# Helper to release a new tools version

set -e

# Used to release langium-ai-tools, and run some preflight release checks as well
echo ""
echo "* Release Script for the Langium AI Tools (langium-ai-tools)"
echo ""
echo "* Double check that you've done everything in RELEASE.md. Hit enter to continue."
read -r

cd ./packages/langium-ai-tools/

VERSION=$(jq -r '.version' package.json)
echo "* Releasing version: ${VERSION}"

# run auto audit & fix
npm audit
npm audit fix

echo ""
echo "* Audit auto-applied, verify there are no changes that need to be applied before proceeding. Enter to continue."
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