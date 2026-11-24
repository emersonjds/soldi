#!/usr/bin/env bash
# Usage: scripts/release.sh X.Y.Z "PR title"
# Run on an up-to-date `developer` whose CHANGELOG.md already has a `## X.Y.Z` section.
# Bumps the versions, refreshes web/openapi.json, opens and merges the release PR once CI is
# green, tags `vX.Y.Z`, deploys the tag with `railway up` (Railway does not deploy `main` by
# itself) and waits until production serves the new version. Prints one line per step.
set -euo pipefail

version=${1:?usage: scripts/release.sh X.Y.Z "PR title"}
title=${2:?usage: scripts/release.sh X.Y.Z "PR title"}
root=$(git rev-parse --show-toplevel)
cd "$root"

step() { printf '%s\n' "$*"; }

[ "$(git rev-parse --abbrev-ref HEAD)" = developer ] || { step "error: not on developer"; exit 1; }
grep -q "^## $version\$" CHANGELOG.md || { step "error: CHANGELOG.md has no '## $version' section"; exit 1; }
git fetch -q origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/developer)" ] || { step "error: developer is not at origin/developer"; exit 1; }

sed -i.bak -E "1,/^version = /s/^version = \"[0-9.]+\"/version = \"$version\"/" Cargo.toml
sed -i.bak -E "1,5s/\"version\": \"[0-9.]+\"/\"version\": \"$version\"/" web/package.json
rm -f Cargo.toml.bak web/package.json.bak
cargo check -q --workspace
docker compose up -d --wait >/dev/null 2>&1
UPDATE_OPENAPI=1 SQLX_OFFLINE=true DATABASE_URL=postgres://soldi:soldi@localhost:5441/soldi \
  cargo test -q -p soldi-server --test openapi >/dev/null
docker compose down >/dev/null 2>&1
step "versions bumped to $version, openapi refreshed"

git add CHANGELOG.md Cargo.toml Cargo.lock web/package.json web/openapi.json
git commit -q -m "chore: release $version"
git push -q origin developer
body=$(awk -v v="## $version" '$0==v{on=1;next} on&&/^## /{exit} on' CHANGELOG.md)
pr=$(gh pr create -B main -H developer -t "Release $version: $title" -b "$body" | tail -1)
step "release PR $pr"

sleep 20
if ! gh pr checks "$pr" --watch --interval 30 >/dev/null 2>&1; then
  step "error: CI failed on $pr"
  gh pr checks "$pr" | awk '$2!="pass"{print "  " $1, $2}'
  exit 1
fi
gh pr merge "$pr" --merge --subject "Release $version" --body "" >/dev/null
git fetch -q origin
sha=$(git rev-parse origin/main)
git tag -a "v$version" "$sha" -m "v$version"
git push -q origin "v$version"
step "merged and tagged v$version at ${sha:0:7}"

worktree="$root/../soldi-release-$version"
git worktree add -q --detach "$worktree" "v$version"
(cd "$worktree" && railway up --ci --project d6f07f0f-e5b9-483d-bbe0-21cdd839574f \
  --environment production --service soldi 2>&1 | tail -1)
git worktree remove "$worktree"

for _ in $(seq 1 12); do
  live=$(curl -s https://getsoldi.app/api/openapi.json | jq -r .info.version)
  [ "$live" = "$version" ] && { step "production serves $live"; exit 0; }
  sleep 15
done
step "error: production still serves $live"
exit 1
