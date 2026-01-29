"""
Model validation methods for CSI Analysis.

Provides LOOCV, ROC-AUC, model comparison, and threshold sensitivity.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Any, Callable
from sklearn.model_selection import LeaveOneOut
from sklearn.metrics import accuracy_score, roc_curve, auc, confusion_matrix
from sklearn.utils import resample
from statsmodels.stats.proportion import proportion_confint

from .statistics import cohens_d


# CSI Factor definitions
FACTORS_V1 = {
    'csuite_turnover': 17,
    'ma_attrition': 15,
    'strategic_ops_lt2': 12,
    'nps_detractor': 10,
    'nps_no_response': 10,
    'no_event_attendance': 10,
    'not_current_sw': 9,
    'resolution_sla_lt90': 5,
    'nps_promoter': -5,  # Protective
}

FACTORS_V2 = {
    'backlog_gt10': 15,
    'nps_detractor': 12,
    'avg_resolution_gt700h': 10,
    'tech_knowledge_gap': 10,
    'not_current_sw': 9,
    'defect_rate_gt30': 8,
    'nps_no_response': 8,
    'ma_attrition': 7,
    'strategic_ops_lt2': 6,
    'csuite_turnover': 5,
    'nps_declining_2plus': 4,
    'no_event_attendance': 4,
    'communication_transparency': -8,  # Protective
    'nps_promoter': -5,  # Protective
}


def calculate_arm_v1(df: pd.DataFrame) -> pd.Series:
    """
    Calculate ARM Index using v1 factors.

    Args:
        df: DataFrame with factor columns

    Returns:
        Series of ARM scores
    """
    arm = pd.Series(0, index=df.index, dtype=float)

    factor_mapping = {
        'csuite_turnover': 'factor_csuite_turnover',
        'ma_attrition': 'factor_ma_attrition',
        'strategic_ops_lt2': 'factor_strategic_ops_lt2',
        'nps_detractor': 'is_detractor',
        'nps_no_response': 'factor_nps_no_response',
        'no_event_attendance': 'factor_no_event_attendance',
        'not_current_sw': 'factor_not_current_sw',
        'resolution_sla_lt90': 'factor_resolution_sla_lt90',
        'nps_promoter': 'is_promoter',
    }

    for factor, weight in FACTORS_V1.items():
        col = factor_mapping.get(factor, f'factor_{factor}')
        if col in df.columns:
            arm += df[col].fillna(False).astype(int) * weight

    return arm


def calculate_arm_v2(df: pd.DataFrame) -> pd.Series:
    """
    Calculate ARM Index using v2 factors.

    Args:
        df: DataFrame with factor columns

    Returns:
        Series of ARM scores
    """
    arm = pd.Series(0, index=df.index, dtype=float)

    factor_mapping = {
        'backlog_gt10': 'factor_backlog_gt10',
        'nps_detractor': 'is_detractor',
        'avg_resolution_gt700h': 'factor_resolution_gt700h',
        'tech_knowledge_gap': 'factor_tech_knowledge_gap',
        'not_current_sw': 'factor_not_current_sw',
        'defect_rate_gt30': 'factor_defect_rate_gt30',
        'nps_no_response': 'factor_nps_no_response',
        'ma_attrition': 'factor_ma_attrition',
        'strategic_ops_lt2': 'factor_strategic_ops_lt2',
        'csuite_turnover': 'factor_csuite_turnover',
        'nps_declining_2plus': 'declining_2_periods',
        'no_event_attendance': 'factor_no_event_attendance',
        'communication_transparency': 'factor_communication',
        'nps_promoter': 'is_promoter',
    }

    for factor, weight in FACTORS_V2.items():
        col = factor_mapping.get(factor, f'factor_{factor}')
        if col in df.columns:
            arm += df[col].fillna(False).astype(int) * weight

    return arm


def apply_factor_thresholds(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply factor thresholds to create boolean factor columns.

    Args:
        df: DataFrame with raw metrics

    Returns:
        DataFrame with factor boolean columns added
    """
    df = df.copy()

    # Factor 1: Backlog > 10
    if 'open_cases' in df.columns:
        df['factor_backlog_gt10'] = df['open_cases'] > 10
    elif 'sla_open_cases' in df.columns:
        df['factor_backlog_gt10'] = df['sla_open_cases'] > 10

    # Factor 3: Avg Resolution > 700h
    if 'avg_resolution_hours' in df.columns:
        df['factor_resolution_gt700h'] = df['avg_resolution_hours'] > 700

    # Factor 9: Strategic Ops < 2/yr
    if 'seg_events_12m' in df.columns:
        df['factor_strategic_ops_lt2'] = df['seg_events_12m'] < 2

    # Factor 12: No Event Attendance
    if 'total_engagement' in df.columns:
        df['factor_no_event_attendance'] = df['total_engagement'] == 0
    elif 'seg_events_12m' in df.columns:
        df['factor_no_event_attendance'] = df['seg_events_12m'] == 0

    # Factor 7: NPS No Response
    if 'nps_response_count' in df.columns:
        df['factor_nps_no_response'] = df['nps_response_count'] == 0

    return df


def loocv_accuracy(
    X: pd.DataFrame,
    y: pd.Series,
    model_func: Callable
) -> Dict[str, Any]:
    """
    Leave-One-Out Cross-Validation for small samples.

    Args:
        X: DataFrame of factor values
        y: Binary outcome (1 = at-risk, 0 = healthy)
        model_func: Function that returns predictions given X

    Returns:
        Dictionary with accuracy, CI, and per-fold results
    """
    loo = LeaveOneOut()
    predictions = []
    actuals = []

    for train_idx, test_idx in loo.split(X):
        X_train = X.iloc[train_idx]
        X_test = X.iloc[test_idx]
        y_train = y.iloc[train_idx]
        y_test = y.iloc[test_idx]

        # Get prediction for held-out sample
        try:
            pred = model_func(X_test, X_train, y_train)
            predictions.append(pred[0] if hasattr(pred, '__len__') else pred)
        except Exception:
            predictions.append(np.nan)

        actuals.append(y_test.values[0])

    # Remove NaN predictions
    valid_mask = ~np.isnan(predictions)
    predictions = np.array(predictions)[valid_mask]
    actuals = np.array(actuals)[valid_mask]

    if len(predictions) == 0:
        return {
            'accuracy': np.nan,
            'correct': 0,
            'total': 0,
            'ci_lower': np.nan,
            'ci_upper': np.nan,
            'predictions': [],
            'actuals': []
        }

    accuracy = accuracy_score(actuals, predictions)
    correct = int(sum(predictions == actuals))

    # Wilson score interval for binomial proportion
    ci_low, ci_high = proportion_confint(
        correct, len(actuals), method='wilson'
    )

    return {
        'accuracy': float(accuracy),
        'correct': correct,
        'total': int(len(actuals)),
        'ci_lower': float(ci_low),
        'ci_upper': float(ci_high),
        'predictions': predictions.tolist(),
        'actuals': actuals.tolist()
    }


def roc_analysis(
    y_true: np.ndarray,
    y_scores: np.ndarray,
    model_name: str = 'Model',
    n_bootstraps: int = 1000
) -> Dict[str, Any]:
    """
    ROC curve analysis with bootstrap CI for AUC.

    Args:
        y_true: Binary actuals (1 = at-risk, 0 = healthy)
        y_scores: Continuous risk scores (e.g., ARM index)
        model_name: Name for reporting
        n_bootstraps: Number of bootstrap iterations

    Returns:
        Dictionary with AUC, CI, curve data, and interpretation
    """
    y_true = np.array(y_true)
    y_scores = np.array(y_scores)

    # Remove NaN
    mask = ~(np.isnan(y_true) | np.isnan(y_scores))
    y_true = y_true[mask]
    y_scores = y_scores[mask]

    if len(np.unique(y_true)) < 2:
        return {
            'model_name': model_name,
            'auc': np.nan,
            'ci_lower': np.nan,
            'ci_upper': np.nan,
            'interpretation': 'insufficient classes'
        }

    fpr, tpr, thresholds = roc_curve(y_true, y_scores)
    roc_auc = auc(fpr, tpr)

    # Bootstrap CI for AUC
    auc_scores = []
    for _ in range(n_bootstraps):
        indices = resample(range(len(y_true)), replace=True)
        y_true_boot = y_true[indices]
        y_scores_boot = y_scores[indices]

        if len(np.unique(y_true_boot)) < 2:
            continue

        fpr_boot, tpr_boot, _ = roc_curve(y_true_boot, y_scores_boot)
        auc_scores.append(auc(fpr_boot, tpr_boot))

    if len(auc_scores) > 0:
        ci_lower = float(np.percentile(auc_scores, 2.5))
        ci_upper = float(np.percentile(auc_scores, 97.5))
    else:
        ci_lower = np.nan
        ci_upper = np.nan

    # Interpretation
    if roc_auc >= 0.9:
        interpretation = 'excellent'
    elif roc_auc >= 0.8:
        interpretation = 'good'
    elif roc_auc >= 0.7:
        interpretation = 'fair'
    else:
        interpretation = 'poor'

    return {
        'model_name': model_name,
        'auc': float(roc_auc),
        'ci_lower': ci_lower,
        'ci_upper': ci_upper,
        'fpr': fpr.tolist(),
        'tpr': tpr.tolist(),
        'thresholds': thresholds.tolist(),
        'interpretation': interpretation
    }


def compare_models(
    y_true: np.ndarray,
    pred_v1: np.ndarray,
    pred_v2: np.ndarray
) -> Dict[str, Any]:
    """
    McNemar's test for comparing two classifiers on same data.

    Args:
        y_true: Actual binary outcomes
        pred_v1: Predictions from model v1
        pred_v2: Predictions from model v2

    Returns:
        Dictionary with accuracies, contingency, and p-value
    """
    y_true = np.array(y_true)
    pred_v1 = np.array(pred_v1)
    pred_v2 = np.array(pred_v2)

    # Contingency table
    # b = v1 wrong, v2 right
    # c = v1 right, v2 wrong
    b = int(sum((pred_v1 != y_true) & (pred_v2 == y_true)))
    c = int(sum((pred_v1 == y_true) & (pred_v2 != y_true)))

    # McNemar's test using exact binomial test
    if b + c > 0:
        from scipy.stats import binomtest
        result = binomtest(b, b + c, 0.5, alternative='two-sided')
        p_value = result.pvalue
    else:
        p_value = 1.0

    return {
        'v1_accuracy': float(sum(pred_v1 == y_true) / len(y_true)),
        'v2_accuracy': float(sum(pred_v2 == y_true) / len(y_true)),
        'v1_correct': int(sum(pred_v1 == y_true)),
        'v2_correct': int(sum(pred_v2 == y_true)),
        'total': int(len(y_true)),
        'v1_wrong_v2_right': b,
        'v1_right_v2_wrong': c,
        'mcnemar_p_value': float(p_value),
        'significant_difference': p_value < 0.05
    }


def threshold_sensitivity(
    metric_values: np.ndarray,
    nps_values: np.ndarray,
    thresholds: List[float],
    metric_name: str = 'Metric'
) -> pd.DataFrame:
    """
    Test multiple thresholds to find optimal cutoff.

    Args:
        metric_values: Array of metric values
        nps_values: Array of corresponding NPS values
        thresholds: List of thresholds to test
        metric_name: Name for reporting

    Returns:
        DataFrame with accuracy and NPS delta at each threshold
    """
    from .statistics import calculate_nps_delta

    results = []
    for thresh in thresholds:
        result = calculate_nps_delta(metric_values, nps_values, thresh)
        result['metric'] = metric_name
        results.append(result)

    return pd.DataFrame(results)


def confusion_matrix_analysis(
    y_true: np.ndarray,
    y_pred: np.ndarray
) -> Dict[str, Any]:
    """
    Generate confusion matrix with derived metrics.

    Args:
        y_true: Actual binary outcomes
        y_pred: Predicted binary outcomes

    Returns:
        Dictionary with TP, TN, FP, FN and derived metrics
    """
    cm = confusion_matrix(y_true, y_pred)

    tn, fp, fn, tp = cm.ravel()

    # Derived metrics
    sensitivity = tp / (tp + fn) if (tp + fn) > 0 else np.nan  # Recall
    specificity = tn / (tn + fp) if (tn + fp) > 0 else np.nan
    precision = tp / (tp + fp) if (tp + fp) > 0 else np.nan
    f1 = 2 * (precision * sensitivity) / (precision + sensitivity) if (precision + sensitivity) > 0 else np.nan

    return {
        'true_positives': int(tp),
        'true_negatives': int(tn),
        'false_positives': int(fp),
        'false_negatives': int(fn),
        'sensitivity': float(sensitivity) if not np.isnan(sensitivity) else None,
        'specificity': float(specificity) if not np.isnan(specificity) else None,
        'precision': float(precision) if not np.isnan(precision) else None,
        'f1_score': float(f1) if not np.isnan(f1) else None,
        'confusion_matrix': cm.tolist()
    }
