#!/usr/bin/env python3
"""
Read 2023 BURC XLSB file and export to JSON for Node.js sync
"""

import json
import os
from pyxlsb import open_workbook

BURC_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC'
XLSB_FILE = f'{BURC_PATH}/2023/Dec 23/2023 12 BURC File.xlsb'
OUTPUT_FILE = '/tmp/burc-2023-data.json'

def format_value(v):
    """Format value for display"""
    if v is None:
        return ''
    if isinstance(v, (int, float)):
        if abs(v) >= 1000000:
            return f'${v/1000000:.2f}M'
        if abs(v) >= 1000:
            return f'${v/1000:.1f}K'
        return f'${v:.0f}'
    return str(v)[:30]

def read_xlsb():
    print('=' * 70)
    print('2023 BURC XLSB FILE ANALYSIS')
    print('=' * 70)

    if not os.path.exists(XLSB_FILE):
        print(f'❌ File not found: {XLSB_FILE}')
        return

    print(f'📂 Reading: {os.path.basename(XLSB_FILE)}')
    print(f'📏 Size: {os.path.getsize(XLSB_FILE) / 1024 / 1024:.2f} MB')

    data = {
        'fiscal_year': 2023,
        'sheets': [],
        'apac_burc': [],
        'pipeline': [],
        'attrition': [],
        'quarterly': []
    }

    try:
        with open_workbook(XLSB_FILE) as wb:
            print(f'\n📋 Sheets: {len(wb.sheets)}')

            for sheet_name in wb.sheets:
                print(f'  - {sheet_name}')
                data['sheets'].append(sheet_name)

            # Read ALL sheets and store data
            all_sheets_data = {}

            for sheet_name in wb.sheets:
                print(f'\n--- Reading: {sheet_name} ---')
                try:
                    with wb.get_sheet(sheet_name) as sheet:
                        rows = []
                        for row in sheet.rows():
                            row_data = [item.v for item in row]
                            # Skip completely empty rows
                            if any(v is not None and v != '' for v in row_data):
                                rows.append(row_data)

                        print(f'   Rows: {len(rows)}')
                        all_sheets_data[sheet_name] = rows

                        # Show sample rows for key sheets
                        if any(k in sheet_name.lower() for k in ['apac', 'dial', 'overview', 'booking', 'ps', 'ma']):
                            for i, row in enumerate(rows[:3]):
                                display = ' | '.join([format_value(v) for v in row[:8]])
                                print(f'   {i}: {display}')

                        # Categorize data
                        sheet_lower = sheet_name.lower()
                        if 'apac' in sheet_lower and 'overview' not in sheet_lower:
                            data['apac_burc'] = rows
                        elif 'dial 2 risk' in sheet_lower:
                            data['pipeline'] = rows
                        elif 'overview' in sheet_lower and 'prior' in sheet_lower:
                            data['quarterly'] = rows
                        elif 'booking' in sheet_lower:
                            data['bookings'] = rows

                except Exception as e:
                    print(f'   ⚠️ Error reading sheet: {e}')

            # Store all sheets for comprehensive access
            data['all_sheets'] = all_sheets_data

            # Save to JSON
            print(f'\n📝 Saving to {OUTPUT_FILE}...')
            with open(OUTPUT_FILE, 'w') as f:
                json.dump(data, f, indent=2, default=str)
            print(f'✅ Saved {os.path.getsize(OUTPUT_FILE) / 1024:.1f} KB')

    except Exception as e:
        print(f'❌ Error: {e}')
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    read_xlsb()
