"""
Data extraction module for CSI Statistical Analysis.

Extracts data from Supabase and builds unified client metrics DataFrame.
Uses client_name_aliases table for proper cross-table client name matching.
"""

import os
import pandas as pd
import numpy as np
from typing import Optional, Dict
from supabase import create_client, Client

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://usoyxsunetvxdjdglkmn.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'sb_secret_tg9qhHtwhKS0rPe_FUgzKA_nOyqLAas')

# Global client name alias cache
_client_alias_cache: Dict[str, str] = {}


def get_supabase() -> Client:
    """Get Supabase client instance."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def extract_client_aliases() -> Dict[str, str]:
    """
    Extract client name aliases from Supabase.

    Returns:
        Dictionary mapping display_name -> canonical_name for all active aliases.
    """
    global _client_alias_cache

    if _client_alias_cache:
        return _client_alias_cache

    supabase = get_supabase()
    response = supabase.table('client_name_aliases').select(
        'display_name, canonical_name'
    ).eq('is_active', True).execute()

    aliases = {}
    for row in response.data:
        display = row.get('display_name', '').strip()
        canonical = row.get('canonical_name', '').strip()
        if display and canonical:
            aliases[display] = canonical

    _client_alias_cache = aliases
    return aliases


def normalize_client_name(name: str, aliases: Dict[str, str] = None) -> str:
    """
    Normalize a client name using aliases table.

    Args:
        name: Raw client name from any data source
        aliases: Optional pre-fetched alias dictionary

    Returns:
        Canonical client name (or original if no alias found)
    """
    if not name:
        return name

    name = str(name).strip()

    if aliases is None:
        aliases = extract_client_aliases()

    # Check for exact alias match
    if name in aliases:
        return aliases[name]

    # Check for case-insensitive match
    name_lower = name.lower()
    for display, canonical in aliases.items():
        if display.lower() == name_lower:
            return canonical

    return name


def extract_nps(period: Optional[str] = None) -> pd.DataFrame:
    """
    Extract NPS responses from Supabase.

    Args:
        period: Optional period filter (e.g., 'Q4 25')

    Returns:
        DataFrame with columns: client_name, score, feedback, period, created_at
        Client names are normalized using client_name_aliases.
    """
    supabase = get_supabase()
    query = supabase.table('nps_responses').select('*')

    if period:
        query = query.eq('period', period)

    response = query.execute()
    df = pd.DataFrame(response.data)

    if len(df) > 0:
        df['score'] = pd.to_numeric(df['score'], errors='coerce')

        # Normalize client names using aliases table
        if 'client_name' in df.columns:
            aliases = extract_client_aliases()
            df['client_name'] = df['client_name'].apply(
                lambda x: normalize_client_name(x, aliases)
            )

    return df


def extract_cases() -> pd.DataFrame:
    """
    Extract support case details from Supabase.

    Returns:
        DataFrame with case-level data including resolution duration.
        Client names are normalized using client_name_aliases for cross-table matching.
    """
    supabase = get_supabase()
    response = supabase.table('support_case_details').select('*').execute()
    df = pd.DataFrame(response.data)

    if len(df) > 0:
        # Convert resolution duration from seconds to hours
        if 'resolution_duration_seconds' in df.columns:
            df['resolution_hours'] = df['resolution_duration_seconds'] / 3600

        # Normalize client names using aliases table
        aliases = extract_client_aliases()
        if 'client_name' in df.columns:
            df['client_name_raw'] = df['client_name']  # Keep original
            df['client_name'] = df['client_name'].apply(
                lambda x: normalize_client_name(x, aliases)
            )

    return df


def extract_sla() -> pd.DataFrame:
    """
    Extract SLA dashboard metrics from Supabase.

    Returns:
        DataFrame with point-in-time SLA metrics per client.
        Client names are normalized using client_name_aliases.
    """
    supabase = get_supabase()
    response = supabase.table('support_sla_latest').select('*').execute()
    df = pd.DataFrame(response.data)

    if len(df) > 0 and 'client_name' in df.columns:
        aliases = extract_client_aliases()
        df['client_name'] = df['client_name'].apply(
            lambda x: normalize_client_name(x, aliases)
        )

    return df


def extract_events() -> pd.DataFrame:
    """
    Extract segmentation events from Supabase.

    Returns:
        DataFrame with segmentation event records.
        Client names are normalized using client_name_aliases.
    """
    supabase = get_supabase()
    response = supabase.table('segmentation_events').select('*').execute()
    df = pd.DataFrame(response.data)

    if len(df) > 0 and 'client_name' in df.columns:
        aliases = extract_client_aliases()
        df['client_name'] = df['client_name'].apply(
            lambda x: normalize_client_name(x, aliases)
        )

    return df


def extract_meetings() -> pd.DataFrame:
    """
    Extract unified meetings from Supabase.

    Returns:
        DataFrame with meeting records.
        Client names are normalized using client_name_aliases.
    """
    supabase = get_supabase()
    response = supabase.table('unified_meetings').select('*').execute()
    df = pd.DataFrame(response.data)

    if len(df) > 0:
        aliases = extract_client_aliases()
        # Check for client_name or client column
        for col in ['client_name', 'client']:
            if col in df.columns:
                df[col] = df[col].apply(
                    lambda x: normalize_client_name(x, aliases)
                )

    return df


def extract_clc() -> pd.DataFrame:
    """
    Extract CLC event attendees from Supabase.

    Returns:
        DataFrame with CLC attendance and feedback data.
        Client names are normalized using client_name_aliases.
    """
    supabase = get_supabase()
    response = supabase.table('clc_event_attendees').select(
        '*, clc_events(event_name, event_year, event_date)'
    ).eq('is_internal', False).execute()
    df = pd.DataFrame(response.data)

    if len(df) > 0 and 'client_name' in df.columns:
        aliases = extract_client_aliases()
        df['client_name'] = df['client_name'].apply(
            lambda x: normalize_client_name(x, aliases)
        )

    return df


def calculate_nps_score(scores: pd.Series) -> float:
    """Calculate NPS from individual scores."""
    if len(scores) == 0:
        return np.nan
    promoters = (scores >= 9).sum()
    detractors = (scores <= 6).sum()
    total = len(scores)
    return ((promoters - detractors) / total) * 100


def build_client_metrics(
    df_nps: pd.DataFrame,
    df_cases: pd.DataFrame,
    df_sla: pd.DataFrame,
    df_events: pd.DataFrame,
    df_meetings: pd.DataFrame,
    df_clc: pd.DataFrame,
    period: Optional[str] = None
) -> pd.DataFrame:
    """
    Build unified client metrics DataFrame from all data sources.

    Args:
        df_nps: NPS responses
        df_cases: Support case details
        df_sla: SLA dashboard metrics
        df_events: Segmentation events
        df_meetings: Unified meetings
        df_clc: CLC event attendees
        period: Optional period for NPS filtering

    Returns:
        DataFrame with one row per client and all metrics.
    """
    # Get unique clients from NPS data
    if period:
        nps_period = df_nps[df_nps['period'] == period]
    else:
        # Use most recent period
        if 'period' in df_nps.columns and len(df_nps) > 0:
            latest_period = df_nps['period'].iloc[-1]  # Assumes sorted
            nps_period = df_nps[df_nps['period'] == latest_period]
        else:
            nps_period = df_nps

    clients = nps_period['client_name'].unique()

    metrics = []
    for client in clients:
        row = {'client_name': client}

        # NPS metrics
        client_nps = nps_period[nps_period['client_name'] == client]
        if len(client_nps) > 0:
            row['nps_score'] = calculate_nps_score(client_nps['score'])
            row['nps_avg_score'] = client_nps['score'].mean()
            row['nps_response_count'] = len(client_nps)
            row['is_detractor'] = row['nps_score'] < 0
            row['is_promoter'] = (client_nps['score'] >= 9).any()
            row['has_verbatim'] = client_nps['feedback'].notna().any()

        # Support case metrics
        client_col = 'client_name' if 'client_name' in df_cases.columns else 'client'
        if client_col in df_cases.columns:
            client_cases = df_cases[df_cases[client_col] == client]
            if len(client_cases) > 0:
                row['total_cases'] = len(client_cases)
                if 'resolution_hours' in client_cases.columns:
                    resolved = client_cases[client_cases['resolution_hours'].notna()]
                    if len(resolved) > 0:
                        row['avg_resolution_hours'] = resolved['resolution_hours'].mean()
                        row['median_resolution_hours'] = resolved['resolution_hours'].median()
                        row['p90_resolution_hours'] = resolved['resolution_hours'].quantile(0.9)

                # Open cases (current state)
                if 'state' in client_cases.columns:
                    open_states = ['New', 'In Progress', 'On Hold']
                    row['open_cases'] = client_cases[client_cases['state'].isin(open_states)].shape[0]

        # SLA metrics (point-in-time)
        if 'client_name' in df_sla.columns:
            client_sla = df_sla[df_sla['client_name'] == client]
            if len(client_sla) > 0:
                sla_row = client_sla.iloc[0]
                row['sla_open_cases'] = sla_row.get('open_cases', np.nan)
                row['sla_aging_30d'] = sla_row.get('aging_30d', np.nan)
                row['sla_resolution_pct'] = sla_row.get('resolution_sla_pct', np.nan)

        # Segmentation events (last 12 months)
        if 'client_name' in df_events.columns:
            client_events = df_events[
                (df_events['client_name'] == client) &
                (df_events.get('completed', True) == True)
            ]
            row['seg_events_12m'] = len(client_events)

        # Meetings (last 12 months)
        meeting_col = 'client' if 'client' in df_meetings.columns else 'client_name'
        if meeting_col in df_meetings.columns:
            client_meetings = df_meetings[df_meetings[meeting_col] == client]
            row['meetings_12m'] = len(client_meetings)

        # CLC attendance
        if 'client_name' in df_clc.columns:
            client_clc = df_clc[df_clc['client_name'] == client]
            row['clc_attendances'] = len(client_clc)
            row['clc_events_attended'] = client_clc['event_id'].nunique() if 'event_id' in client_clc.columns else 0
            row['clc_feedback_count'] = client_clc['feedback_value_rating'].notna().sum() if 'feedback_value_rating' in client_clc.columns else 0

        # Combined engagement
        row['total_engagement'] = (
            row.get('seg_events_12m', 0) +
            row.get('meetings_12m', 0) +
            row.get('clc_attendances', 0)
        )

        metrics.append(row)

    df = pd.DataFrame(metrics)

    # Calculate declining 2+ periods
    if 'client_name' in df.columns and len(df_nps) > 0:
        df['declining_2_periods'] = df['client_name'].apply(
            lambda c: _is_declining_2_periods(df_nps, c)
        )

    return df


def _is_declining_2_periods(df_nps: pd.DataFrame, client: str) -> bool:
    """Check if client has declining NPS for 2+ consecutive periods."""
    client_nps = df_nps[df_nps['client_name'] == client].copy()

    if len(client_nps) < 2:
        return False

    # Group by period and calculate average score
    period_scores = client_nps.groupby('period')['score'].mean().sort_index()

    if len(period_scores) < 2:
        return False

    # Check for 2+ consecutive declines
    declines = 0
    prev_score = None
    for score in period_scores:
        if prev_score is not None and score < prev_score:
            declines += 1
            if declines >= 2:
                return True
        else:
            declines = 0
        prev_score = score

    return False
