"""
Reporting module for CSI Statistical Analysis.

Generates Markdown reports, JSON output, and visualisations.
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns


def generate_json_output(
    data: Dict[str, Any],
    output_path: Path
) -> None:
    """
    Save analysis results as JSON.

    Args:
        data: Dictionary of analysis results
        output_path: Path to save JSON file
    """
    # Custom JSON encoder for numpy types
    class NumpyEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, np.bool_):
                return bool(obj)
            if isinstance(obj, np.integer):
                return int(obj)
            if isinstance(obj, np.floating):
                return float(obj)
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            if isinstance(obj, pd.Timestamp):
                return obj.isoformat()
            if pd.isna(obj):
                return None
            return super().default(obj)

    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2, cls=NumpyEncoder)


def generate_markdown_report(
    data: Dict[str, Any],
    output_path: Path
) -> None:
    """
    Generate human-readable Markdown report.

    Args:
        data: Dictionary of analysis results
        output_path: Path to save Markdown file
    """
    timestamp = data.get('timestamp', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    period = data.get('period', 'All periods')
    n_clients = data.get('n_clients', 'N/A')

    report = f"""# CSI Factor Model Statistical Analysis

**Generated:** {timestamp}
**Period:** {period}
**Clients Analysed:** {n_clients}

---

## 1. Power Analysis

"""

    power = data.get('power_analysis', {})
    if power:
        min_d = power.get('min_detectable_d')
        min_d_str = f"{min_d:.2f}" if isinstance(min_d, (int, float)) and min_d is not None else 'N/A'
        report += f"""With n={power.get('n', 'N/A')} clients at alpha={power.get('alpha', 0.05)} and power={power.get('power', 0.80)},
the minimum detectable effect size is Cohen's d = {min_d_str}.

**Interpretation:** {power.get('interpretation', 'N/A')}

"""

    report += """---

## 2. Correlation Analysis

| Metric | Spearman ρ | 95% CI | p-value | n | Significant |
|--------|-----------|--------|---------|---|-------------|
"""

    correlations = data.get('correlations', {})
    for name, corr in correlations.items():
        rho = corr.get('rho', np.nan)
        ci_l = corr.get('ci_lower')
        ci_u = corr.get('ci_upper')
        p = corr.get('p_value', np.nan)
        n = corr.get('n', 'N/A')
        sig = "✓" if corr.get('significant', False) else "✗"

        rho_str = f"{rho:.3f}" if not np.isnan(rho) else "N/A"
        ci_str = f"[{ci_l:.3f}, {ci_u:.3f}]" if ci_l is not None and ci_u is not None else "N/A"
        p_str = f"{p:.4f}" if not np.isnan(p) else "N/A"

        report += f"| {name} | {rho_str} | {ci_str} | {p_str} | {n} | {sig} |\n"

    # Bonferroni correction note
    if len(correlations) > 1:
        adjusted_alpha = 0.05 / len(correlations)
        report += f"""
> **Note:** With {len(correlations)} comparisons, Bonferroni-adjusted α = {adjusted_alpha:.4f}

"""

    report += """---

## 3. Model Validation

### 3.1 Leave-One-Out Cross-Validation

"""

    loocv = data.get('loocv', {})
    if loocv:
        acc = loocv.get('accuracy', np.nan)
        correct = loocv.get('correct', 'N/A')
        total = loocv.get('total', 'N/A')
        ci_l = loocv.get('ci_lower', np.nan)
        ci_u = loocv.get('ci_upper', np.nan)

        acc_str = f"{acc:.1%}" if not np.isnan(acc) else "N/A"
        ci_str = f"[{ci_l:.1%}, {ci_u:.1%}]" if not (np.isnan(ci_l) or np.isnan(ci_u)) else "N/A"

        report += f"""- **Accuracy:** {acc_str} ({correct}/{total})
- **95% CI (Wilson):** {ci_str}

"""

    report += """### 3.2 ROC-AUC Analysis

| Model | AUC | 95% CI | Interpretation |
|-------|-----|--------|----------------|
"""

    for model_key in ['roc_v1', 'roc_v2']:
        roc = data.get(model_key, {})
        if roc:
            name = roc.get('model_name', model_key.replace('roc_', 'CSI '))
            auc_val = roc.get('auc', np.nan)
            ci_l = roc.get('ci_lower')
            ci_u = roc.get('ci_upper')
            interp = roc.get('interpretation', 'N/A')

            auc_str = f"{auc_val:.3f}" if not np.isnan(auc_val) else "N/A"
            ci_str = f"[{ci_l:.3f}, {ci_u:.3f}]" if ci_l is not None and ci_u is not None else "N/A"

            report += f"| {name} | {auc_str} | {ci_str} | {interp} |\n"

    report += """
### 3.3 Model Comparison (McNemar's Test)

"""

    comparison = data.get('model_comparison', {})
    if comparison:
        v1_acc = comparison.get('v1_accuracy', np.nan)
        v2_acc = comparison.get('v2_accuracy', np.nan)
        b = comparison.get('v1_wrong_v2_right', 'N/A')
        c = comparison.get('v1_right_v2_wrong', 'N/A')
        p = comparison.get('mcnemar_p_value', np.nan)
        sig = comparison.get('significant_difference', False)

        v1_str = f"{v1_acc:.1%}" if not np.isnan(v1_acc) else "N/A"
        v2_str = f"{v2_acc:.1%}" if not np.isnan(v2_acc) else "N/A"
        p_str = f"{p:.4f}" if not np.isnan(p) else "N/A"

        conclusion = "v2 significantly outperforms v1" if sig else "No significant difference between models"

        report += f"""| Metric | Value |
|--------|-------|
| v1 Accuracy | {v1_str} |
| v2 Accuracy | {v2_str} |
| v1 wrong, v2 right | {b} |
| v1 right, v2 wrong | {c} |
| McNemar's p-value | {p_str} |

**Conclusion:** {conclusion}

"""

    # Confusion matrix if available
    cm = data.get('confusion_matrix', {})
    if cm:
        report += """### 3.4 Confusion Matrix (v2 Model)

| | Predicted At-Risk | Predicted Healthy |
|---|---|---|
| **Actual At-Risk** | {tp} (TP) | {fn} (FN) |
| **Actual Healthy** | {fp} (FP) | {tn} (TN) |

| Metric | Value |
|--------|-------|
| Sensitivity (Recall) | {sens} |
| Specificity | {spec} |
| Precision | {prec} |
| F1 Score | {f1} |

""".format(
            tp=cm.get('true_positives', 'N/A'),
            fn=cm.get('false_negatives', 'N/A'),
            fp=cm.get('false_positives', 'N/A'),
            tn=cm.get('true_negatives', 'N/A'),
            sens=f"{cm.get('sensitivity', 0):.1%}" if cm.get('sensitivity') else "N/A",
            spec=f"{cm.get('specificity', 0):.1%}" if cm.get('specificity') else "N/A",
            prec=f"{cm.get('precision', 0):.1%}" if cm.get('precision') else "N/A",
            f1=f"{cm.get('f1_score', 0):.3f}" if cm.get('f1_score') else "N/A",
        )

    report += """---

## 4. Visualisations

- [Correlation Heatmap](plots/correlation_heatmap.png)
- [ROC Curves](plots/roc_curves.png)
- [Threshold Sensitivity](plots/threshold_sensitivity.png)

---

*Generated by CSI Statistical Analysis Pipeline v1.0.0*
"""

    with open(output_path, 'w') as f:
        f.write(report)


def plot_correlation_heatmap(
    df: pd.DataFrame,
    output_path: Path,
    metrics: Optional[list] = None
) -> None:
    """
    Generate correlation heatmap for metrics vs NPS.

    Args:
        df: DataFrame with metrics and nps_score
        output_path: Path to save plot
        metrics: Optional list of metric columns to include
    """
    if metrics is None:
        metrics = [
            'avg_resolution_hours', 'open_cases', 'total_cases',
            'seg_events_12m', 'meetings_12m', 'clc_attendances',
            'total_engagement'
        ]

    # Filter to available columns
    available = [m for m in metrics if m in df.columns]
    if 'nps_score' not in df.columns or len(available) == 0:
        return

    # Calculate correlation matrix
    cols = available + ['nps_score']
    corr_df = df[cols].dropna()

    if len(corr_df) < 3:
        return

    corr_matrix = corr_df.corr(method='spearman')

    # Plot
    fig, ax = plt.subplots(figsize=(10, 8))
    sns.heatmap(
        corr_matrix,
        annot=True,
        fmt='.2f',
        cmap='RdBu_r',
        center=0,
        vmin=-1,
        vmax=1,
        square=True,
        ax=ax
    )
    ax.set_title('Spearman Correlation Matrix: Metrics vs NPS', fontsize=14)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()


def plot_roc_curves(
    roc_v1: Dict[str, Any],
    roc_v2: Dict[str, Any],
    output_path: Path
) -> None:
    """
    Plot ROC curves for v1 and v2 models.

    Args:
        roc_v1: ROC analysis results for v1
        roc_v2: ROC analysis results for v2
        output_path: Path to save plot
    """
    fig, ax = plt.subplots(figsize=(8, 8))

    # Random classifier baseline
    ax.plot([0, 1], [0, 1], 'k--', label='Random (AUC = 0.50)')

    # v1 curve
    if 'fpr' in roc_v1 and 'tpr' in roc_v1:
        auc_v1 = roc_v1.get('auc', np.nan)
        ci_l = roc_v1.get('ci_lower')
        ci_u = roc_v1.get('ci_upper')
        label = f"CSI v1 (AUC = {auc_v1:.2f}"
        if ci_l is not None and ci_u is not None:
            label += f", 95% CI [{ci_l:.2f}, {ci_u:.2f}]"
        label += ")"
        ax.plot(roc_v1['fpr'], roc_v1['tpr'], 'b-', linewidth=2, label=label)

    # v2 curve
    if 'fpr' in roc_v2 and 'tpr' in roc_v2:
        auc_v2 = roc_v2.get('auc', np.nan)
        ci_l = roc_v2.get('ci_lower')
        ci_u = roc_v2.get('ci_upper')
        label = f"CSI v2 (AUC = {auc_v2:.2f}"
        if ci_l is not None and ci_u is not None:
            label += f", 95% CI [{ci_l:.2f}, {ci_u:.2f}]"
        label += ")"
        ax.plot(roc_v2['fpr'], roc_v2['tpr'], 'r-', linewidth=2, label=label)

    ax.set_xlabel('False Positive Rate', fontsize=12)
    ax.set_ylabel('True Positive Rate', fontsize=12)
    ax.set_title('ROC Curves: CSI v1 vs v2', fontsize=14)
    ax.legend(loc='lower right')
    ax.set_xlim([0, 1])
    ax.set_ylim([0, 1])
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()


def plot_threshold_sensitivity(
    df: pd.DataFrame,
    output_path: Path,
    metric: str = 'avg_resolution_hours',
    metric_label: str = 'Avg Resolution Time (hours)'
) -> None:
    """
    Plot threshold sensitivity analysis.

    Args:
        df: DataFrame with metric and nps_score
        output_path: Path to save plot
        metric: Column name for metric
        metric_label: Display label for metric
    """
    if metric not in df.columns or 'nps_score' not in df.columns:
        return

    # Generate thresholds
    values = df[metric].dropna()
    if len(values) < 3:
        return

    thresholds = np.linspace(values.min(), values.max(), 20)

    results = []
    for thresh in thresholds:
        above = df[df[metric] > thresh]['nps_score'].dropna()
        below = df[df[metric] <= thresh]['nps_score'].dropna()

        if len(above) > 0 and len(below) > 0:
            results.append({
                'threshold': thresh,
                'n_above': len(above),
                'n_below': len(below),
                'nps_delta': above.mean() - below.mean()
            })

    if len(results) == 0:
        return

    results_df = pd.DataFrame(results)

    # Plot
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

    # NPS Delta by threshold
    ax1.plot(results_df['threshold'], results_df['nps_delta'], 'b-', linewidth=2)
    ax1.axhline(y=0, color='k', linestyle='--', alpha=0.5)
    ax1.set_xlabel(metric_label, fontsize=12)
    ax1.set_ylabel('NPS Delta (Above - Below)', fontsize=12)
    ax1.set_title('NPS Delta by Threshold', fontsize=14)
    ax1.grid(True, alpha=0.3)

    # Find optimal threshold (maximum absolute delta)
    optimal_idx = results_df['nps_delta'].abs().idxmax()
    optimal_thresh = results_df.loc[optimal_idx, 'threshold']
    optimal_delta = results_df.loc[optimal_idx, 'nps_delta']
    ax1.axvline(x=optimal_thresh, color='r', linestyle='--', alpha=0.7,
                label=f'Optimal: {optimal_thresh:.0f} (Δ={optimal_delta:.1f})')
    ax1.legend()

    # Sample size by threshold
    ax2.fill_between(results_df['threshold'], 0, results_df['n_above'],
                     alpha=0.5, label='n Above')
    ax2.fill_between(results_df['threshold'], 0, results_df['n_below'],
                     alpha=0.5, label='n Below')
    ax2.set_xlabel(metric_label, fontsize=12)
    ax2.set_ylabel('Sample Size', fontsize=12)
    ax2.set_title('Sample Size by Threshold', fontsize=14)
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
