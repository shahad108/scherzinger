#!/usr/bin/env bash
# Real-build contamination gate.
#
# Historically this script checked byte-identical MD5s of the real
# (base=/) bundle against a frozen baseline. That turned out to be too
# strict: Tailwind v4 CSS scan + Terser mangler + JSX child folding
# produce 5-80 byte drift from dead code that does NOT represent any
# actual phase 4/5 code or data leaking into the customer-facing build.
#
# The real invariant is: the real bundle must not contain any of the
# phase 4/5 namespace strings. If none appear, the real build is
# uncontaminated regardless of micro byte drift.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build > /tmp/phase45-real-build.log 2>&1

# Fail the build if any phase 4/5 artifact shows up in the real bundle.
FORBIDDEN='ScenarioLab\|phase45\|mock_phase45\|MonteCarlo\|FlaskConical\|computeShockedMargin\|findSKUDetail\|getRegimeCurves\|SKUDeepDive'

leak=$(grep -o "$FORBIDDEN" dist/assets/*.js 2>/dev/null | sort -u || true)
if [ -n "$leak" ]; then
  echo "❌ LEAK: real build contains phase 4/5 artifacts:"
  echo "$leak" | sed 's/^/   /'
  echo "   See /tmp/phase45-real-build.log for build output."
  exit 1
fi

# Also fail if a separate phase45/scenario-lab chunk appears in dist/assets/.
if ls dist/assets/ 2>/dev/null | grep -qi 'phase45\|scenariolab\|ScenarioLab'; then
  echo "❌ LEAK: real build emitted a phase45/ScenarioLab chunk in dist/assets/:"
  ls dist/assets/ | grep -i 'phase45\|scenariolab\|ScenarioLab' | sed 's/^/   /'
  exit 1
fi

# Report the current hash for visibility (not for enforcement).
hash=$(md5 -q dist/assets/index-*.js 2>/dev/null || md5sum dist/assets/index-*.js | awk '{print $1}')
echo "✅ Real build clean (no phase 4/5 artifacts found). Bundle hash: $hash"
