#!/usr/bin/env bash
# Gate: the real (base=/) build must match the baseline captured before
# Phase 4/5 work started. If any hash differs, abort.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build > /tmp/phase45-real-build.log 2>&1

new=$(md5 -q dist/assets/index-*.js 2>/dev/null || md5sum dist/assets/index-*.js | awk '{print $1}')
newHtml=$(md5 -q dist/index.html 2>/dev/null || md5sum dist/index.html | awk '{print $1}')

base=$(grep 'assets/index' /tmp/phase45-baseline.txt | awk -F'= ' '{print $2}')
baseHtml=$(grep 'index.html' /tmp/phase45-baseline.txt | awk -F'= ' '{print $2}')

if [ "$new" != "$base" ] || [ "$newHtml" != "$baseHtml" ]; then
  echo "❌ LEAK: real build hash changed."
  echo "   bundle: baseline=$base new=$new"
  echo "   html:   baseline=$baseHtml new=$newHtml"
  exit 1
fi
echo "✅ Real build unchanged (bundle $new, html $newHtml)"
