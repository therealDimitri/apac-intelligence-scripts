#!/bin/bash
#
# Setup Activity Register Sync Service
#
# Installs/manages the hourly launchd job that syncs activity completions
# from the Excel Activity Register to the database.
#
# Usage:
#   ./scripts/setup-activity-sync.sh [install|uninstall|status]
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.altera.activity-sync.plist"
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
    echo -e "${BLUE}  Activity Register Sync Setup${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

install_launchd() {
    echo -e "${YELLOW}Installing hourly activity sync job...${NC}"

    mkdir -p "$HOME/Library/LaunchAgents"

    if [ -f "$PLIST_SOURCE" ]; then
        sed "s|/Users/jimmy.leimonitis/.nvm/versions/node/v24.11.0/bin/node|$NODE_PATH|g" "$PLIST_SOURCE" > "$PLIST_DEST"
        echo -e "  ${GREEN}✓${NC} Plist copied to $PLIST_DEST"
    else
        echo -e "  ${RED}✗${NC} Source plist not found: $PLIST_SOURCE"
        return 1
    fi

    launchctl unload "$PLIST_DEST" 2>/dev/null
    launchctl load "$PLIST_DEST"
    echo -e "  ${GREEN}✓${NC} Launchd job loaded"

    echo ""
    echo -e "${GREEN}Hourly activity sync job installed!${NC}"
    echo "  - Runs every hour automatically"
    echo "  - Logs: /tmp/activity-sync.log"
    echo "  - Errors: /tmp/activity-sync-error.log"
}

uninstall_launchd() {
    echo -e "${YELLOW}Uninstalling hourly activity sync job...${NC}"

    if [ -f "$PLIST_DEST" ]; then
        launchctl unload "$PLIST_DEST" 2>/dev/null
        rm "$PLIST_DEST"
        echo -e "  ${GREEN}✓${NC} Launchd job removed"
    else
        echo -e "  ${YELLOW}⚠${NC} Job was not installed"
    fi
}

show_status() {
    echo -e "${YELLOW}Checking activity sync status...${NC}"
    echo ""

    if [ -f "$PLIST_DEST" ]; then
        if launchctl list | grep -q "com.altera.activity-sync"; then
            echo -e "  ${GREEN}●${NC} Hourly job: ${GREEN}Running${NC}"
        else
            echo -e "  ${YELLOW}●${NC} Hourly job: ${YELLOW}Loaded but not running${NC}"
        fi
    else
        echo -e "  ${RED}●${NC} Hourly job: ${RED}Not installed${NC}"
    fi

    echo ""
    echo -e "${YELLOW}Recent sync logs:${NC}"
    if [ -f /tmp/activity-sync.log ]; then
        tail -20 /tmp/activity-sync.log 2>/dev/null | grep -E "(✅|❌|Found|Synced|Summary)"
    else
        echo "  No logs found"
    fi
}

print_usage() {
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo "  $0 install    - Install hourly activity sync job"
    echo "  $0 uninstall  - Remove hourly activity sync job"
    echo "  $0 status     - Show sync status"
    echo ""
    echo -e "${YELLOW}Manual Sync:${NC}"
    echo "  node scripts/sync-excel-activities.mjs"
    echo "  node scripts/sync-excel-activities.mjs --dry-run"
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
