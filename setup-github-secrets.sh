#!/bin/bash

# Setup GitHub Secrets for Aging Accounts Automation
# This script adds the required secrets to enable GitHub Actions automation

echo "╔═══════════════════════════════════════════════════╗"
echo "║   GitHub Secrets Setup                           ║"
echo "║   Aging Accounts Automation                      ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed"
    echo "   Installing via Homebrew..."
    brew install gh
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "🔐 You need to authenticate with GitHub first"
    echo ""
    gh auth login
fi

# Load environment variables
if [ ! -f .env.local ]; then
    echo "❌ .env.local file not found"
    exit 1
fi

source .env.local

echo "📝 Adding GitHub Secrets..."
echo ""

# Add NEXT_PUBLIC_SUPABASE_URL
echo "Adding NEXT_PUBLIC_SUPABASE_URL..."
echo "$NEXT_PUBLIC_SUPABASE_URL" | gh secret set NEXT_PUBLIC_SUPABASE_URL

if [ $? -eq 0 ]; then
    echo "✅ NEXT_PUBLIC_SUPABASE_URL added"
else
    echo "❌ Failed to add NEXT_PUBLIC_SUPABASE_URL"
fi

# Add SUPABASE_SERVICE_ROLE_KEY
echo "Adding SUPABASE_SERVICE_ROLE_KEY..."
echo "$SUPABASE_SERVICE_ROLE_KEY" | gh secret set SUPABASE_SERVICE_ROLE_KEY

if [ $? -eq 0 ]; then
    echo "✅ SUPABASE_SERVICE_ROLE_KEY added"
else
    echo "❌ Failed to add SUPABASE_SERVICE_ROLE_KEY"
fi

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║   Setup Complete!                                ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "🎉 GitHub Secrets are now configured!"
echo ""
echo "Next steps:"
echo "1. Test the workflow manually:"
echo "   Go to: https://github.com/therealDimitri/apac-intelligence-v2/actions"
echo "   Click 'Import Aging Accounts Data' → 'Run workflow'"
echo ""
echo "2. Or push a new Excel file to trigger auto-import:"
echo "   git add data/NewFile.xlsx"
echo "   git commit -m 'Weekly aging update'"
echo "   git push"
echo ""
