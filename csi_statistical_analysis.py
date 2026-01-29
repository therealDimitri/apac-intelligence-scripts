#!/usr/bin/env python3
"""
CSI Statistical Analysis Pipeline

Generates reproducible statistical analysis for CSI factor model validation.
Outputs JSON (machine-readable), Markdown (human-readable), and visualisations.

Usage:
    python csi_statistical_analysis.py
    python csi_statistical_analysis.py --output-dir ./reports
    python csi_statistical_analysis.py --period "Q4 25"

Requirements:
    pip install -r requirements-stats.txt
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import pandas as pd

from csi_stats.extract import (
    extract_nps, extract_cases, extract_sla,
    extract_events, extract_meetings, extract_clc,
    build_client_metrics
)
from csi_stats.statistics import (
    spearman_with_ci, cohens_d, minimum_detectable_effect,
    apply_bonferroni_correction
)
from csi_stats.validation import (
    loocv_accuracy, roc_analysis, compare_models,
    threshold_sensitivity, calculate_arm_v1, calculate_arm_v2,
    apply_factor_thresholds, confusion_matrix_analysis
)
from csi_stats.reporting import (
    generate_markdown_report, generate_json_output,
    plot_correlation_heatmap, plot_roc_curves,
    plot_threshold_sensitivity
)


def main(output_dir: Path, period: str = None, verbose: bool = True):
    """
    Run full CSI statistical analysis pipeline.

    Args:
        output_dir: Directory for output files
        period: Optional NPS period filter (e.g., 'Q4 25')
        verbose: Print progress messages

    Returns:
        Dictionary of analysis results
    """
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    def log(msg):
        if verbose:
            print(msg)

    # ========== DATA EXTRACTION ==========
    log("📊 Extracting data from Supabase...")

    df_nps = extract_nps(period=period)
    log(f"   → NPS responses: {len(df_nps)}")

    df_cases = extract_cases()
    log(f"   → Support cases: {len(df_cases)}")

    df_sla = extract_sla()
    log(f"   → SLA records: {len(df_sla)}")

    df_events = extract_events()
    log(f"   → Segmentation events: {len(df_events)}")

    df_meetings = extract_meetings()
    log(f"   → Meetings: {len(df_meetings)}")

    df_clc = extract_clc()
    log(f"   → CLC attendees: {len(df_clc)}")

    # Build unified metrics
    df_metrics = build_client_metrics(
        df_nps, df_cases, df_sla, df_events, df_meetings, df_clc, period
    )
    log(f"   → Clients with data: {len(df_metrics)}")

    if len(df_metrics) == 0:
        log("❌ No client data found. Exiting.")
        return None

    # Apply factor thresholds
    df_metrics = apply_factor_thresholds(df_metrics)

    # ========== POWER ANALYSIS ==========
    log("\n⚡ Running power analysis...")
    n_clients = len(df_metrics)
    power = minimum_detectable_effect(n_clients)
    log(f"   → {power['interpretation']}")

    # ========== CORRELATION ANALYSIS ==========
    log("\n📈 Running correlation analysis...")
    correlations = {}
    p_values = []

    metrics_to_test = [
        ('avg_resolution_hours', 'Avg Resolution Time'),
        ('open_cases', 'Open Cases'),
        ('total_cases', 'Total Cases'),
        ('clc_attendances', 'CLC Attendances'),
        ('seg_events_12m', 'Segmentation Events'),
        ('meetings_12m', 'Meetings'),
        ('total_engagement', 'Total Engagement'),
    ]

    for col, name in metrics_to_test:
        if col in df_metrics.columns and 'nps_score' in df_metrics.columns:
            x = df_metrics[col].values
            y = df_metrics['nps_score'].values

            # Skip if insufficient data
            valid = ~(np.isnan(x) | np.isnan(y))
            if valid.sum() < 3:
                continue

            result = spearman_with_ci(x, y)
            correlations[name] = result
            if result['p_value'] is not None:
                p_values.append(result['p_value'])

            sig = "✓" if result['significant'] else "✗"
            ci_str = f"[{result['ci_lower']:.3f}, {result['ci_upper']:.3f}]" if result['ci_lower'] else "N/A"
            log(f"   → {name}: ρ={result['rho']:.3f} {ci_str} p={result['p_value']:.4f} {sig}")

    # Apply Bonferroni correction
    if len(p_values) > 1:
        bonferroni = apply_bonferroni_correction(p_values)
        log(f"   → Bonferroni adjusted α: {bonferroni['adjusted_alpha']:.4f}")
        log(f"   → Significant after correction: {bonferroni['significant_after_correction']}/{len(p_values)}")

    # ========== MODEL VALIDATION ==========
    log("\n🔍 Validating CSI model...")

    # Calculate ARM scores
    df_metrics['arm_v1'] = calculate_arm_v1(df_metrics)
    df_metrics['arm_v2'] = calculate_arm_v2(df_metrics)
    df_metrics['csi_v1'] = 100 - df_metrics['arm_v1']
    df_metrics['csi_v2'] = 100 - df_metrics['arm_v2']

    # Binary classification (at-risk = NPS < 0)
    if 'nps_score' in df_metrics.columns:
        df_metrics['actual_risk'] = (df_metrics['nps_score'] < 0).astype(int)
        df_metrics['pred_v1'] = (df_metrics['csi_v1'] < 80).astype(int)
        df_metrics['pred_v2'] = (df_metrics['csi_v2'] < 80).astype(int)

        # Filter to clients with valid NPS
        valid_clients = df_metrics[df_metrics['nps_score'].notna()].copy()

        if len(valid_clients) >= 3:
            # Simple prediction function for LOOCV
            def predict_v2(X_test, X_train, y_train):
                # For CSI, we just apply thresholds - no training needed
                arm = calculate_arm_v2(X_test)
                csi = 100 - arm
                return (csi < 80).astype(int).values

            # LOOCV
            loocv_result = loocv_accuracy(
                valid_clients.drop(columns=['actual_risk', 'pred_v1', 'pred_v2', 'nps_score'], errors='ignore'),
                valid_clients['actual_risk'],
                predict_v2
            )
            log(f"   → LOOCV Accuracy: {loocv_result['accuracy']:.1%} "
                f"[{loocv_result['ci_lower']:.1%}, {loocv_result['ci_upper']:.1%}]")

            # ROC-AUC
            roc_v1 = roc_analysis(
                valid_clients['actual_risk'].values,
                valid_clients['arm_v1'].values,
                'CSI v1'
            )
            roc_v2 = roc_analysis(
                valid_clients['actual_risk'].values,
                valid_clients['arm_v2'].values,
                'CSI v2'
            )
            log(f"   → ROC-AUC v1: {roc_v1['auc']:.3f} ({roc_v1['interpretation']})")
            log(f"   → ROC-AUC v2: {roc_v2['auc']:.3f} ({roc_v2['interpretation']})")

            # Model comparison
            comparison = compare_models(
                valid_clients['actual_risk'].values,
                valid_clients['pred_v1'].values,
                valid_clients['pred_v2'].values
            )
            sig = "significant" if comparison['significant_difference'] else "not significant"
            log(f"   → McNemar's test: p={comparison['mcnemar_p_value']:.4f} ({sig})")

            # Confusion matrix for v2
            cm = confusion_matrix_analysis(
                valid_clients['actual_risk'].values,
                valid_clients['pred_v2'].values
            )
            log(f"   → v2 Sensitivity: {cm['sensitivity']:.1%}" if cm['sensitivity'] else "")
            log(f"   → v2 Specificity: {cm['specificity']:.1%}" if cm['specificity'] else "")
        else:
            loocv_result = {}
            roc_v1 = {}
            roc_v2 = {}
            comparison = {}
            cm = {}
            log("   → Insufficient clients for model validation")
    else:
        loocv_result = {}
        roc_v1 = {}
        roc_v2 = {}
        comparison = {}
        cm = {}

    # ========== THRESHOLD SENSITIVITY ==========
    log("\n📉 Running threshold sensitivity analysis...")

    threshold_results = {}
    if 'avg_resolution_hours' in df_metrics.columns and 'nps_score' in df_metrics.columns:
        resolution_thresholds = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
        thresh_df = threshold_sensitivity(
            df_metrics['avg_resolution_hours'].values,
            df_metrics['nps_score'].values,
            resolution_thresholds,
            'Avg Resolution Time'
        )
        threshold_results['resolution_time'] = thresh_df.to_dict('records')

        # Find optimal
        if len(thresh_df) > 0:
            optimal = thresh_df.loc[thresh_df['nps_delta'].abs().idxmax()]
            log(f"   → Optimal resolution threshold: {optimal['threshold']:.0f}h "
                f"(Δ={optimal['nps_delta']:.1f}, d={optimal['cohens_d']:.2f})")

    # ========== GENERATE OUTPUTS ==========
    log("\n📝 Generating outputs...")

    output_dir.mkdir(parents=True, exist_ok=True)
    plots_dir = output_dir / 'plots'
    plots_dir.mkdir(exist_ok=True)

    # Compile results
    json_output = {
        'timestamp': timestamp,
        'period': period or 'all',
        'n_clients': n_clients,
        'power_analysis': power,
        'correlations': correlations,
        'loocv': loocv_result,
        'roc_v1': {k: v for k, v in roc_v1.items() if k not in ['fpr', 'tpr', 'thresholds']},
        'roc_v2': {k: v for k, v in roc_v2.items() if k not in ['fpr', 'tpr', 'thresholds']},
        'model_comparison': comparison,
        'confusion_matrix': cm,
        'threshold_sensitivity': threshold_results
    }

    # JSON output
    json_path = output_dir / f'csi_statistics_{timestamp}.json'
    generate_json_output(json_output, json_path)
    log(f"   → {json_path}")

    # Markdown report
    md_path = output_dir / f'csi_statistics_{timestamp}.md'
    generate_markdown_report(json_output, md_path)
    log(f"   → {md_path}")

    # Plots
    try:
        plot_correlation_heatmap(df_metrics, plots_dir / 'correlation_heatmap.png')
        log(f"   → {plots_dir / 'correlation_heatmap.png'}")
    except Exception as e:
        log(f"   ⚠ Correlation heatmap failed: {e}")

    try:
        if roc_v1 and roc_v2:
            plot_roc_curves(roc_v1, roc_v2, plots_dir / 'roc_curves.png')
            log(f"   → {plots_dir / 'roc_curves.png'}")
    except Exception as e:
        log(f"   ⚠ ROC curves failed: {e}")

    try:
        plot_threshold_sensitivity(
            df_metrics, plots_dir / 'threshold_sensitivity.png',
            metric='avg_resolution_hours',
            metric_label='Avg Resolution Time (hours)'
        )
        log(f"   → {plots_dir / 'threshold_sensitivity.png'}")
    except Exception as e:
        log(f"   ⚠ Threshold sensitivity plot failed: {e}")

    log("\n✅ Analysis complete")

    return json_output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='CSI Factor Model Statistical Analysis',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python csi_statistical_analysis.py
    python csi_statistical_analysis.py --period "Q4 25"
    python csi_statistical_analysis.py --output-dir ./docs/reports
        """
    )
    parser.add_argument(
        '--output-dir',
        type=Path,
        default=Path(__file__).parent / 'reports' / 'statistics',
        help='Directory for output files (default: ./reports/statistics)'
    )
    parser.add_argument(
        '--period',
        type=str,
        default=None,
        help='NPS period to analyse (e.g., "Q4 25")'
    )
    parser.add_argument(
        '--quiet',
        action='store_true',
        help='Suppress progress messages'
    )

    args = parser.parse_args()

    result = main(args.output_dir, args.period, verbose=not args.quiet)

    if result is None:
        sys.exit(1)
