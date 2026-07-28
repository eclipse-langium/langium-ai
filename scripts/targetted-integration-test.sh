#!/bin/bash

# Targeted integration test
# Clones a given "org/project" from GitHub as an assumed-valid Langium project,
# then runs the standard LAI integration workflow against it using what's on disk.
# Prelim version should be attended by humans.
#
# Usage:
#   scripts/targetted-integration-test.sh <org/project>
#
# Example:
#   scripts/targetted-integration-test.sh eclipse-langium/langium

set -euo pipefail

# require an "org/project" argument
if [ "$#" -ne 1 ]; then
    echo "usage: $0 <org/project>"
    echo "  e.g. $0 eclipse-langium/langium"
    exit 1
fi

TARGET="$1"

# basic shape validation: exactly one slash, non-empty org and project
if [[ ! "$TARGET" =~ ^[^/]+/[^/]+$ ]]; then
    echo "[FAILED] expected an 'org/project' name, got: '$TARGET'"
    exit 1
fi

PROJECT_NAME="${TARGET#*/}"

# resolve repo root regardless of where this is invoked from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TEST_FOLDER="${REPO_ROOT}/targetted-integration-test"
rm -rf "$TEST_FOLDER"
mkdir "$TEST_FOLDER"

CLONE_DIR="${TEST_FOLDER}/${PROJECT_NAME}"

echo "=== Cloning ${TARGET} ==="
git clone --depth 1 "https://github.com/${TARGET}.git" "$CLONE_DIR"

# shared LAI workflow, mirrors integration-test.sh
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

assert_exists() {
    local path="$1"
    if [ ! -e "$path" ]; then
        echo "[FAILED] expected '$path' to exist"
        exit 1
    fi
}

run_lai_workflow "$TARGET" "$CLONE_DIR"

echo "

[PASSED]"
