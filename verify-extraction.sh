#!/bin/bash
# verify-extraction.sh
# Run after each extraction task to verify changes
#
# Usage: ./verify-extraction.sh

set -e

echo "🔍 Running Extraction Verification"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check for new folders
echo -e "\n📁 Checking folder structure..."
for dir in lib/core lib/blueprint lib/scenario lib/generation lib/ui lib/editor; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✅${NC} $dir exists"
    else
        echo -e "${YELLOW}⏭️${NC}  $dir not yet created"
    fi
done

# 2. Check for syntax errors in new files
echo -e "\n📝 Checking syntax..."
syntax_errors=0
shopt -s nullglob
for f in lib/core/*.js lib/blueprint/*.js lib/scenario/*.js lib/generation/*.js; do
    if [ -f "$f" ]; then
        if node --check "$f" 2>/dev/null; then
            echo -e "${GREEN}✅${NC} $f"
        else
            echo -e "${RED}❌${NC} $f - syntax error"
            syntax_errors=$((syntax_errors + 1))
        fi
    fi
done
shopt -u nullglob

if [ $syntax_errors -gt 0 ]; then
    echo -e "\n${RED}❌ Found $syntax_errors syntax errors. Fix before proceeding.${NC}"
    exit 1
fi

# 3. Run import verification
echo -e "\n📦 Checking module exports..."
if [ -f "test-wave-imports.js" ]; then
    node test-wave-imports.js || true
else
    echo -e "${YELLOW}⚠️${NC}  test-wave-imports.js not found"
fi

# 4. Check file sizes
echo -e "\n📏 Current file sizes:"
echo "Target: all files < 400 lines"
echo ""
wc -l lib/blueprint-module.js 2>/dev/null | awk '{printf "   blueprint-module.js: %s lines", $1; if ($1 > 400) print " ⚠️  OVER LIMIT"; else print " ✅"}'

shopt -s nullglob
for f in lib/core/*.js lib/blueprint/*.js lib/scenario/*.js; do
    if [ -f "$f" ]; then
        wc -l "$f" | awk -v file="$f" '{printf "   %s: %s lines", file, $1; if ($1 > 400) print " ⚠️"; else print " ✅"}'
    fi
done
shopt -u nullglob

# 5. Git status summary
echo -e "\n📋 Git changes:"
git status --short | head -20
changed_count=$(git status --short | wc -l | tr -d ' ')
if [ "$changed_count" -gt 0 ]; then
    echo ""
    echo "   $changed_count files changed"
fi

# 6. Quick sanity check - blueprint-module still works
echo -e "\n🧪 Quick sanity check..."
if node --check lib/blueprint-module.js 2>/dev/null; then
    echo -e "${GREEN}✅${NC} blueprint-module.js syntax OK"
else
    echo -e "${RED}❌${NC} blueprint-module.js has syntax errors!"
    exit 1
fi

echo ""
echo "=================================="
echo -e "${GREEN}✨ Verification complete${NC}"
echo ""
echo "Next steps:"
echo "  1. Test in SillyTavern browser"
echo "  2. Check console for [Story Mode] errors"
echo "  3. If all good: git add -A && git commit"
