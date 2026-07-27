#!/bin/bash

# Manual integration test
# Creates a real langium project (via `yo langium`, scripted non-interactively),
# and then sets up LAI in it using what's on disk.
# Then runs up through everything to ensure it works.
# Prelim version should be attended by humans.

set -euo pipefail

# resolve repo root regardless of where this is invoked from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TEST_FOLDER="${REPO_ROOT}/integration-test"
rm -rf "$TEST_FOLDER"
mkdir "$TEST_FOLDER"

# install if lai is not detected locally...
# often we use a linked local copy for tests, so we don't want to change that here
# npm install langium-...

# scaffold a langium project non-interactively.
# the langium generator asks 8 defaulted prompts plus a final VS Code
# "Open with `code` / Skip" select. scripts/setup-langium-project.ts uses
# yeoman-test to answer all of them programmatically (Skip on the last one),
# so no arrow keys / enter presses are needed.
echo "* scaffolding langium project"
node --experimental-strip-types "${SCRIPT_DIR}/setup-langium-project.ts" "$TEST_FOLDER"

cd "${TEST_FOLDER}/hello-world"

echo "* lai init"
lai init -y

assert_exists() {
    local path="$1"
    if [ ! -e "$path" ]; then
        echo "[FAILED] expected '$path' to exist"
        exit 1
    fi
}

assert_exists "lai.config.jsonc"
assert_exists "evals"
assert_exists "evals/basic.eval.ts"
assert_exists "evals/utils.ts"

echo "* lai status check"
lai status
echo "* lai version check"
lai --version

# auto-init
echo "* lai gen descriptor"
lai gen descriptor --fresh

assert_exists "hello-world-workspace.descriptor.yml"

echo "* lai gen sysprompt"
lai gen sysprompt --fresh

assert_exists "hello-world-workspace.sysprompt.md"

echo "* lai eval"
lai eval

# run the same check on langium's own examples + langium itself
run_lai_workflow() {
    local label="$1"
    local dir="$2"

    echo ""
    echo "=== Testing: ${label} ==="
    cd "$dir"

    echo "* [${label}] lai init"
    lai init -y

    assert_exists "lai.config.jsonc"
    assert_exists "evals"
    assert_exists "evals/basic.eval.ts"
    assert_exists "evals/utils.ts"

    echo "* [${label}] lai status"
    lai status

    echo "* [${label}] lai gen descriptor"
    lai gen descriptor --fresh

    local descriptor
    descriptor="$(find . -maxdepth 1 -name '*.descriptor.yml' | head -1)"
    if [ -z "$descriptor" ]; then
        echo "[FAILED] no descriptor file generated for ${label}"
        exit 1
    fi

    echo "* [${label}] lai gen sysprompt"
    lai gen sysprompt --fresh

    local sysprompt
    sysprompt="$(find . -maxdepth 1 -name '*.sysprompt.md' | head -1)"
    if [ -z "$sysprompt" ]; then
        echo "[FAILED] no sysprompt file generated for ${label}"
        exit 1
    fi

    echo "* [${label}] lai eval"
    lai eval

    echo "* [${label}] PASSED"
}

# pull the langium monorepo examples and run the workflow on each
LANGIUM_DIR="${TEST_FOLDER}/eclipse-langium"
mkdir -p "$LANGIUM_DIR"

LANGIUM_EXAMPLES=(arithmetics requirements domainmodel statemachine)

echo ""
echo "=== Pulling eclipse-langium examples via degit ==="

for example in "${LANGIUM_EXAMPLES[@]}"; do
    example_dir="${LANGIUM_DIR}/${example}"
    mkdir -p "$example_dir"
    echo "* degit eclipse-langium/langium/examples/${example}"
    npx --yes degit "eclipse-langium/langium/examples/${example}" "$example_dir" --force
done

for example in "${LANGIUM_EXAMPLES[@]}"; do
    run_lai_workflow "langium/examples/${example}" "${LANGIUM_DIR}/${example}"
done

echo "

[PASSED]"