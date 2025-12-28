#!/bin/bash
#
# Setup BURC Sync Services
#
# This script sets up the hybrid sync approach:
# 1. Hourly cron job via launchd (backup sync)
# 2. Instructions for file watcher (real-time sync)
#
# Usage:
#   ./scripts/setup-burc-sync.sh [install|uninstall|status]
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.altera.burc-sync.plist"
PLIST_SOURCE="$SCRIPT_DIR/launchd/$PLIST_NAME"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"
NODE_PATH=$(which node)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  BURC Sync Setup - Hybrid Approach${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

install_launchd() {
    echo -e "${YELLOW}Installing hourly sync job...${NC}"

    # Create LaunchAgents directory if it doesn't exist
    mkdir -p "$HOME/Library/LaunchAgents"

    # Update the plist with correct node path
    if [ -f "$PLIST_SOURCE" ]; then
        sed "s|/usr/local/bin/node|$NODE_PATH|g" "$PLIST_SOURCE" > "$PLIST_DEST"
        echo -e "  ${GREEN}✓${NC} Plist copied to $PLIST_DEST"
    else
        echo -e "  ${RED}✗${NC} Source plist not found: $PLIST_SOURCE"
        return 1
    fi

    # Load the job
    launchctl unload "$PLIST_DEST" 2>/dev/null
    launchctl load "$PLIST_DEST"
    echo -e "  ${GREEN}✓${NC} Launchd job loaded"

    echo ""
    echo -e "${GREEN}Hourly sync job installed!${NC}"
    echo "  - Runs every hour automatically"
    echo "  - Logs: /tmp/burc-sync.log"
    echo "  - Errors: /tmp/burc-sync-error.log"
}

uninstall_launchd() {
    echo -e "${YELLOW}Uninstalling hourly sync job...${NC}"

    if [ -f "$PLIST_DEST" ]; then
        launchctl unload "$PLIST_DEST" 2>/dev/null
        rm "$PLIST_DEST"
        echo -e "  ${GREEN}✓${NC} Launchd job removed"
    else
        echo -e "  ${YELLOW}⚠${NC} Job was not installed"
    fi
}

show_status() {
    echo -e "${YELLOW}Checking sync status...${NC}"
    echo ""

    # Check launchd job
    if [ -f "$PLIST_DEST" ]; then
        if launchctl list | grep -q "com.altera.burc-sync"; then
            echo -e "  ${GREEN}●${NC} Hourly job: ${GREEN}Running${NC}"
        else
            echo -e "  ${YELLOW}●${NC} Hourly job: ${YELLOW}Loaded but not running${NC}"
        fi
    else
        echo -e "  ${RED}●${NC} Hourly job: ${RED}Not installed${NC}"
    fi

    # Check file watcher
    if pgrep -f "watch-burc.mjs" > /dev/null; then
        echo -e "  ${GREEN}●${NC} File watcher: ${GREEN}Running${NC}"
    else
        echo -e "  ${YELLOW}●${NC} File watcher: ${YELLOW}Not running${NC}"
    fi

    # Check last sync
    echo ""
    echo -e "${YELLOW}Recent sync logs:${NC}"
    if [ -f /tmp/burc-sync.log ]; then
        tail -20 /tmp/burc-sync.log 2>/dev/null | grep -E "(✅|❌|Syncing|synced)"
    else
        echo "  No logs found"
    fi
}

print_usage() {
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo "  $0 install    - Install hourly sync job"
    echo "  $0 uninstall  - Remove hourly sync job"
    echo "  $0 status     - Show sync status"
    echo ""
    echo -e "${YELLOW}File Watcher (real-time):${NC}"
    echo "  Run in a terminal: node scripts/watch-burc.mjs"
    echo ""
    echo -e "${YELLOW}Manual Sync:${NC}"
    echo "  node scripts/sync-burc-data.mjs"
    echo ""
}

# Main
print_header

case "$1" in
    install)
        install_launchd
        ;;
    uninstall)
        uninstall_launchd
        ;;
    status)
        show_status
        ;;
    *)
        print_usage
        ;;
esac

echo ""
