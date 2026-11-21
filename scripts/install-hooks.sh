#!/bin/sh
# Point the clone's hooks at the versioned guards in scripts/git-hooks.
# One command per clone; the guards then run on every commit.
set -e
cd "$(dirname "$0")/.."
git config core.hooksPath scripts/git-hooks
echo "hooks installed — commits are now refused unless signed CoralAgent"
