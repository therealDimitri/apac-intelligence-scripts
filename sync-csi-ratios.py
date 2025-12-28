#!/usr/bin/env python3
"""
Sync CSI Ratios Data from BURC Excel Files

Extracts OPEX breakdown by category (PS, Maintenance, S&M, R&D, G&A)
and revenue data needed to calculate Harris/CSI Operating Ratios.

Supports:
- .xlsx files (2024/2025 APAC Performance format)
- .xlsb files (monthly BURC format)

Usage:
    python3 scripts/sync-csi-ratios.py [--file PATH] [--year YEAR]

Example:
    python3 scripts/sync-csi-ratios.py --file "/path/to/2025 APAC Performance.xlsx" --year 2025
"""

import os
import sys
import argparse
from datetime import datetime
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

# Default file paths
DEFAULT_FILES = {
    2024: '/Users/jimmy.leimonitis/Downloads/2024 APAC Performance.xlsx',
    2025: '/Users/jimmy.leimonitis/Downloads/2025 APAC Performance.xlsx',
}

MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def get_database_url():
    """Get database URL from environment"""
    return os.environ.get('DATABASE_URL_DIRECT') or os.environ.get('DATABASE_URL')


def create_tables(conn):
    """Create required tables if they don't exist"""
    with conn.cursor() as cur:
        # CSI OPEX breakdown table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS burc_csi_opex (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                year INTEGER NOT NULL,
                month_num INTEGER NOT NULL,
                month TEXT NOT NULL,

                -- Revenue (Net)
                license_nr DECIMAL(15,2),
                ps_nr DECIMAL(15,2),
                maintenance_nr DECIMAL(15,2),
                total_nr DECIMAL(15,2),

                -- OPEX by Category
                ps_opex DECIMAL(15,2),
                maintenance_opex DECIMAL(15,2),
                sm_opex DECIMAL(15,2),
                rd_opex DECIMAL(15,2),
                ga_opex DECIMAL(15,2),
                total_opex DECIMAL(15,2),

                -- Summary
                ebita DECIMAL(15,2),
                ebita_percent DECIMAL(8,4),

                -- Metadata
                source_file TEXT,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(year, month_num)
            );
        """)

        # CSI Ratios calculated table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS burc_csi_ratios (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                year INTEGER NOT NULL,
                month_num INTEGER NOT NULL,

                -- Calculated Ratios
                ps_ratio DECIMAL(8,4),
                sales_ratio DECIMAL(8,4),
                maintenance_ratio DECIMAL(8,4),
                rd_ratio DECIMAL(8,4),
                ga_ratio DECIMAL(8,4),

                -- Status (green/amber/red)
                ps_status TEXT,
                sales_status TEXT,
                maintenance_status TEXT,
                rd_status TEXT,
                ga_status TEXT,

                -- Metadata
                calculated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(year, month_num)
            );
        """)

        conn.commit()
        print('✅ Tables created/verified')


def get_cell_value(ws, row, col):
    """Safely get cell value from openpyxl worksheet"""
    try:
        val = ws.cell(row=row, column=col).value
        if val is not None:
            return float(val)
    except (TypeError, ValueError):
        pass
    return 0.0


def extract_xlsx_data(file_path, year):
    """Extract all months of data from APAC Performance xlsx file"""
    import openpyxl

    print(f'📊 Reading file: {file_path}')
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)

    all_months_data = []

    # Sheet references
    nr_sheet = wb['APAC BURC - Monthly NR Comp']
    opex_sheet = wb['APAC BURC - Monthly OPEX Comp']
    ebita_sheet = wb['APAC BURC - Monthly EBITA']

    # Row mappings (1-indexed for openpyxl)
    # Net Revenue rows (Actual values)
    NR_ROWS = {
        'license_nr': 4,      # Licence Net Revenue - Actual
        'ps_nr': 9,           # Professional Services - Actual
        'maintenance_nr': 14, # Maintenance Net Revenue - Actual
        'total_nr': 24,       # Total Net Revenue - Actual
    }

    # OPEX rows (Actual values)
    OPEX_ROWS = {
        'ps_opex': 4,           # Professional Services OPEX - Actual
        'maintenance_opex': 9,  # Maintenance OPEX - Actual
        'sm_opex': 14,          # Sales & Marketing OPEX - Actual
        'rd_opex': 19,          # Research & Development OPEX - Actual
        'ga_opex': 24,          # General & Administrative OPEX - Actual
        'total_opex': 30,       # Total OPEX - Actual
    }

    # EBITA rows
    EBITA_ROWS = {
        'ebita': 4,          # EBITA - Actual
        'ebita_percent': 9,  # EBITA % - Actual
    }

    # Columns: B=2 (Jan), C=3 (Feb), ... M=13 (Dec)

    for month_num in range(1, 13):
        col = month_num + 1  # Column B = 2 for Jan

        data = {
            'year': year,
            'month_num': month_num,
            'month': MONTHS[month_num - 1],
            'source_file': file_path,
        }

        # Extract Net Revenue
        for key, row in NR_ROWS.items():
            data[key] = get_cell_value(nr_sheet, row, col)

        # Extract OPEX
        for key, row in OPEX_ROWS.items():
            data[key] = get_cell_value(opex_sheet, row, col)

        # Extract EBITA
        for key, row in EBITA_ROWS.items():
            data[key] = get_cell_value(ebita_sheet, row, col)

        # Only include months with actual data
        if data['total_nr'] != 0 or data['total_opex'] != 0:
            all_months_data.append(data)

    wb.close()
    return all_months_data


def extract_xlsb_data(file_path, year, month_num=None):
    """Extract data from BURC xlsb file - all 12 months or single month"""
    from pyxlsb import open_workbook

    print(f'📊 Reading BURC file: {file_path}')

    # Row mappings vary by year - detect based on file structure
    # 2023 BURC files have different row positions than 2024+

    # 2023 format row mappings (0-indexed)
    OPEX_ROWS_2023 = {
        'ps_opex': 93,           # Row 93: PS OPEX before Dep
        'maintenance_opex': 120,  # Row 120: Maintenance OPEX before Dep
        'sm_opex': 147,          # Row 147: S&M OPEX before Dep
        'rd_opex': 174,          # Row 174: R&D OPEX before Dep
        'ga_opex': 201,          # Row 201: G&A OPEX before Dep
        'total_opex': 204,       # Row 204: Total OPEX
    }

    REVENUE_ROWS_2023 = {
        'license_nr': 49,        # Row 49: Net License Revenue
        'ps_nr': 50,             # Row 50: Net PS Revenue
        'maintenance_nr': 55,    # Row 55: Net Maintenance Revenue
        'total_nr': 65,          # Row 65: Total Net Revenue
    }

    SUMMARY_ROWS_2023 = {
        'ebita': 206,            # Row 206: EBITA
        'ebita_percent': 207,    # Row 207: EBITA % (estimated)
    }

    # 2024+ format row mappings (0-indexed) - original format
    OPEX_ROWS_2024 = {
        'ps_opex': 97,
        'maintenance_opex': 126,
        'sm_opex': 155,
        'rd_opex': 184,
        'ga_opex': 213,
        'total_opex': 244,
    }

    REVENUE_ROWS_2024 = {
        'license_nr': 50,
        'ps_nr': 54,
        'maintenance_nr': 60,
        'total_nr': 67,
    }

    SUMMARY_ROWS_2024 = {
        'ebita': 246,
        'ebita_percent': 247,
    }

    # Select row mappings based on year
    if year <= 2023:
        OPEX_ROWS = OPEX_ROWS_2023
        REVENUE_ROWS = REVENUE_ROWS_2023
        SUMMARY_ROWS = SUMMARY_ROWS_2023
        # 2023 files have monthly data in columns 14-25 (Jan-Dec)
        MONTH_COLUMNS = {m: 13 + m for m in range(1, 13)}  # Jan=14, Feb=15, ..., Dec=25
        print(f'   Using 2023 file format (all 12 months in columns 14-25)')
    else:
        OPEX_ROWS = OPEX_ROWS_2024
        REVENUE_ROWS = REVENUE_ROWS_2024
        SUMMARY_ROWS = SUMMARY_ROWS_2024
        MONTH_COLUMNS = {12: 10}  # Only current period column for 2024+ xlsb
        print(f'   Using 2024+ file format row mappings')

    all_months_data = []

    with open_workbook(file_path) as wb:
        with wb.get_sheet('APAC') as sheet:
            rows = list(sheet.rows())

            # Determine which months to extract
            if month_num:
                months_to_extract = [month_num]
            elif year <= 2023:
                months_to_extract = range(1, 13)  # All 12 months
            else:
                months_to_extract = [12]  # Default to December for older format

            for m in months_to_extract:
                col = MONTH_COLUMNS.get(m, 10)

                data = {
                    'year': year,
                    'month_num': m,
                    'month': MONTHS[m - 1],
                    'source_file': file_path,
                }

                for key, row_idx in REVENUE_ROWS.items():
                    if row_idx < len(rows) and col < len(rows[row_idx]):
                        try:
                            val = rows[row_idx][col].v
                            data[key] = float(val) if val else 0.0
                        except:
                            data[key] = 0.0
                    else:
                        data[key] = 0.0

                for key, row_idx in OPEX_ROWS.items():
                    if row_idx < len(rows) and col < len(rows[row_idx]):
                        try:
                            val = rows[row_idx][col].v
                            data[key] = float(val) if val else 0.0
                        except:
                            data[key] = 0.0
                    else:
                        data[key] = 0.0

                for key, row_idx in SUMMARY_ROWS.items():
                    if row_idx < len(rows) and col < len(rows[row_idx]):
                        try:
                            val = rows[row_idx][col].v
                            data[key] = float(val) if val else 0.0
                        except:
                            data[key] = 0.0
                    else:
                        data[key] = 0.0

                # Only include months with actual data
                if data.get('total_nr', 0) != 0 or data.get('total_opex', 0) != 0:
                    all_months_data.append(data)

    return all_months_data


def calculate_csi_ratios(data):
    """Calculate CSI ratios from extracted data"""

    license_nr = data.get('license_nr', 0) or 0
    ps_nr = data.get('ps_nr', 0) or 0
    maintenance_nr = data.get('maintenance_nr', 0) or 0
    total_nr = data.get('total_nr', 0) or 0

    ps_opex = data.get('ps_opex', 0) or 0
    sm_opex = abs(data.get('sm_opex', 0) or 0)
    maintenance_opex = data.get('maintenance_opex', 0) or 0
    rd_opex = data.get('rd_opex', 0) or 0
    ga_opex = data.get('ga_opex', 0) or 0

    # Calculate ratios
    ps_ratio = ps_nr / ps_opex if ps_opex > 0 else 0
    sales_ratio = (0.70 * license_nr) / sm_opex if sm_opex > 0 else 0
    maint_ratio = (0.85 * maintenance_nr) / maintenance_opex if maintenance_opex > 0 else 0
    rd_contribution = (0.30 * license_nr) + (0.15 * maintenance_nr)
    rd_ratio = rd_contribution / rd_opex if rd_opex > 0 else 0
    ga_ratio = (ga_opex / total_nr * 100) if total_nr > 0 else 0

    def get_status_gte(value, target):
        if value >= target:
            return 'green'
        elif value >= target * 0.8:
            return 'amber'
        return 'red'

    def get_status_lte(value, target):
        if value <= target:
            return 'green'
        elif value <= target * 1.2:
            return 'amber'
        return 'red'

    return {
        'year': data['year'],
        'month_num': data['month_num'],
        'ps_ratio': round(ps_ratio, 4),
        'sales_ratio': round(sales_ratio, 4),
        'maintenance_ratio': round(maint_ratio, 4),
        'rd_ratio': round(rd_ratio, 4),
        'ga_ratio': round(ga_ratio, 4),
        'ps_status': get_status_gte(ps_ratio, 2),
        'sales_status': get_status_gte(sales_ratio, 1),
        'maintenance_status': get_status_gte(maint_ratio, 4),
        'rd_status': get_status_gte(rd_ratio, 1),
        'ga_status': get_status_lte(ga_ratio, 20),
    }


def save_to_database(conn, data, ratios):
    """Save extracted data and calculated ratios to database"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO burc_csi_opex
            (year, month_num, month, license_nr, ps_nr, maintenance_nr, total_nr,
             ps_opex, maintenance_opex, sm_opex, rd_opex, ga_opex, total_opex,
             ebita, ebita_percent, source_file)
            VALUES (%(year)s, %(month_num)s, %(month)s, %(license_nr)s, %(ps_nr)s,
                    %(maintenance_nr)s, %(total_nr)s, %(ps_opex)s, %(maintenance_opex)s,
                    %(sm_opex)s, %(rd_opex)s, %(ga_opex)s, %(total_opex)s,
                    %(ebita)s, %(ebita_percent)s, %(source_file)s)
            ON CONFLICT (year, month_num) DO UPDATE SET
                license_nr = EXCLUDED.license_nr,
                ps_nr = EXCLUDED.ps_nr,
                maintenance_nr = EXCLUDED.maintenance_nr,
                total_nr = EXCLUDED.total_nr,
                ps_opex = EXCLUDED.ps_opex,
                maintenance_opex = EXCLUDED.maintenance_opex,
                sm_opex = EXCLUDED.sm_opex,
                rd_opex = EXCLUDED.rd_opex,
                ga_opex = EXCLUDED.ga_opex,
                total_opex = EXCLUDED.total_opex,
                ebita = EXCLUDED.ebita,
                ebita_percent = EXCLUDED.ebita_percent,
                source_file = EXCLUDED.source_file,
                updated_at = NOW()
        """, data)

        cur.execute("""
            INSERT INTO burc_csi_ratios
            (year, month_num, ps_ratio, sales_ratio, maintenance_ratio, rd_ratio, ga_ratio,
             ps_status, sales_status, maintenance_status, rd_status, ga_status)
            VALUES (%(year)s, %(month_num)s, %(ps_ratio)s, %(sales_ratio)s,
                    %(maintenance_ratio)s, %(rd_ratio)s, %(ga_ratio)s,
                    %(ps_status)s, %(sales_status)s, %(maintenance_status)s,
                    %(rd_status)s, %(ga_status)s)
            ON CONFLICT (year, month_num) DO UPDATE SET
                ps_ratio = EXCLUDED.ps_ratio,
                sales_ratio = EXCLUDED.sales_ratio,
                maintenance_ratio = EXCLUDED.maintenance_ratio,
                rd_ratio = EXCLUDED.rd_ratio,
                ga_ratio = EXCLUDED.ga_ratio,
                ps_status = EXCLUDED.ps_status,
                sales_status = EXCLUDED.sales_status,
                maintenance_status = EXCLUDED.maintenance_status,
                rd_status = EXCLUDED.rd_status,
                ga_status = EXCLUDED.ga_status,
                calculated_at = NOW()
        """, ratios)

        conn.commit()


def print_summary(all_data, all_ratios):
    """Print summary table of all months"""
    print('\n' + '='*90)
    print('CSI OPERATING RATIOS SUMMARY')
    print('='*90)

    status_emoji = {'green': '🟢', 'amber': '🟠', 'red': '🔴'}

    print(f"{'Month':<6} {'PS':>8} {'Sales':>8} {'Maint':>8} {'R&D':>8} {'G&A':>8} {'EBITA':>12} {'EBITA%':>8}")
    print('-'*90)

    for data, ratios in zip(all_data, all_ratios):
        ps_e = status_emoji.get(ratios['ps_status'], '⚪')
        sales_e = status_emoji.get(ratios['sales_status'], '⚪')
        maint_e = status_emoji.get(ratios['maintenance_status'], '⚪')
        rd_e = status_emoji.get(ratios['rd_status'], '⚪')
        ga_e = status_emoji.get(ratios['ga_status'], '⚪')

        ebita = data.get('ebita', 0) or 0
        ebita_pct = (data.get('ebita_percent', 0) or 0) * 100

        print(f"{data['month']:<6} "
              f"{ps_e}{ratios['ps_ratio']:>6.2f} "
              f"{sales_e}{ratios['sales_ratio']:>6.2f} "
              f"{maint_e}{ratios['maintenance_ratio']:>6.2f} "
              f"{rd_e}{ratios['rd_ratio']:>6.2f} "
              f"{ga_e}{ratios['ga_ratio']:>6.1f}% "
              f"${ebita/1000:>9.0f}K "
              f"{ebita_pct:>6.1f}%")

    print('-'*90)
    print(f"{'Target':<6} {'≥2.0':>8} {'≥1.0':>8} {'≥4.0':>8} {'≥1.0':>8} {'≤20%':>8}")
    print('='*90)


def main():
    parser = argparse.ArgumentParser(description='Sync CSI Ratios from BURC/APAC Performance files')
    parser.add_argument('--file', type=str, help='Path to Excel file')
    parser.add_argument('--year', type=int, default=2025, help='Fiscal year')
    parser.add_argument('--month', type=int, help='Specific month (for xlsb files)')
    args = parser.parse_args()

    db_url = get_database_url()
    if not db_url:
        print('❌ DATABASE_URL not found in environment')
        sys.exit(1)

    # Determine file path
    if args.file:
        file_path = args.file
    elif args.year in DEFAULT_FILES:
        file_path = DEFAULT_FILES[args.year]
    else:
        print(f'❌ No file configured for year {args.year}')
        sys.exit(1)

    if not os.path.exists(file_path):
        print(f'❌ File not found: {file_path}')
        sys.exit(1)

    print(f'\n📈 CSI Ratios Sync')
    print(f'   Year: {args.year}')
    print(f'   File: {file_path}\n')

    conn = psycopg2.connect(db_url)

    try:
        create_tables(conn)

        # Determine file type and extract data
        if file_path.endswith('.xlsb'):
            # 2023 xlsb files contain all 12 months, later years need --month
            if args.year <= 2023:
                all_data = extract_xlsb_data(file_path, args.year, args.month)  # month_num is optional
            elif not args.month:
                print('❌ Month required for xlsb files after 2023 (--month N)')
                sys.exit(1)
            else:
                all_data = extract_xlsb_data(file_path, args.year, args.month)
        else:
            all_data = extract_xlsx_data(file_path, args.year)

        print(f'   Found {len(all_data)} months of data\n')

        # Calculate ratios and save
        all_ratios = []
        for data in all_data:
            ratios = calculate_csi_ratios(data)
            all_ratios.append(ratios)
            save_to_database(conn, data, ratios)

        # Print summary
        print_summary(all_data, all_ratios)

        print(f'\n✅ Saved {len(all_data)} months to database')
        print('✅ CSI Ratios sync completed successfully!')

    finally:
        conn.close()


if __name__ == '__main__':
    main()
