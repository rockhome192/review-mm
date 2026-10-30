#!/usr/bin/env bash
# Publish a filtered copy of this repo's main branch to the public portfolio repo.
# Same filter every run, so the rewritten commits keep the same hashes and the push
# is a plain fast-forward. Left out: raw AniList/MangaUpdates data and crowd notes
# (they hold other people's review text), the AI editor's verdicts (they quote that text
# to show what was copied) and the design export files.
# After a change to the filter the hashes change: run once with FORCE=1 to overwrite.
# Commit emails become the GitHub noreply address.
#
# Needs: git-filter-repo (python -m pip install --user git-filter-repo)
# Usage: bash scripts/sync-public.sh
set -euo pipefail

SRC="https://github.com/rockhome192/review-manga.git"
DEST="https://github.com/rockhome192/review-mm.git"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone --quiet --single-branch --branch main "$SRC" "$WORK/repo"
cd "$WORK/repo"
printf 'rockhome192 <209334608+rockhome192@users.noreply.github.com> <rockhome03@gmail.com>\n' > "$WORK/mailmap"
python -m git_filter_repo --force --quiet \
  --invert-paths \
  --path data/raw/ \
  --path data/crowd/ \
  --path data/reviews/ \
  --path-glob 'data/rec-text/review-*' \
  --path-glob 'data/model-test/review-*' \
  --path-glob 'data/model-test/batch-review*' \
  --path "มังงะ-มังฮวา เว็บแนะนำ.zip" \
  --path "อ่านอะไรดี - Home 2b.html" \
  --mailmap "$WORK/mailmap"

# refuse to publish if anything excluded or the private email survived
if git -c core.quotepath=off log --all --name-only --format= | grep -qE '^data/(raw|crowd|reviews)/|^data/(rec-text|model-test)/(batch-)?review|\.zip$|Home 2b\.html$'; then
  echo "excluded files still in history, not pushing" >&2; exit 1
fi
if git log --all --format='%ae%n%ce' | grep -qv 'users.noreply.github.com'; then
  echo "a non-noreply email is still in history, not pushing" >&2; exit 1
fi

git push ${FORCE:+--force} "$DEST" main
echo "public repo now at $(git rev-parse --short HEAD) ($(git rev-list --count HEAD) commits)"
