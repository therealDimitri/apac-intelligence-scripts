"""
Core statistical methods for CSI Analysis.

Provides Spearman correlation with CI, effect sizes, and power analysis.
"""

import numpy as np
import pandas as pd
from scipy.stats import spearmanr, bootstrap
from statsmodels.stats.power import TTestIndPower
from typing import Dict, List, Tuple, Any


def spearman_with_ci(
    x: np.ndarray,
    y: np.ndarray,
    confidence: float = 0.95,
    n_bootstrap: int = 10000
) -> Dict[str, Any]:
    """
    Spearman correlation with bootstrap confidence interval.

    Args:
        x: First variable array
        y: Second variable array
        confidence: Confidence level (default 0.95)
        n_bootstrap: Number of bootstrap resamples

    Returns:
        Dictionary with rho, p_value, ci_lower, ci_upper, n, significant
    """
    # Remove NaN pairs
    mask = ~(np.isnan(x) | np.isnan(y))
    x_clean = np.array(x)[mask]
    y_clean = np.array(y)[mask]

    if len(x_clean) < 3:
        return {
            'rho': np.nan,
            'p_value': np.nan,
            'ci_lower': np.nan,
            'ci_upper': np.nan,
            'n': len(x_clean),
            'significant': False
        }

    # Core correlation
    rho, p_value = spearmanr(x_clean, y_clean)

    # Bootstrap CI for small samples
    def statistic(x_boot, y_boot, axis=None):
        if len(x_boot) < 3:
            return np.nan
        r, _ = spearmanr(x_boot, y_boot)
        return r

    try:
        data = (x_clean, y_clean)
        res = bootstrap(
            data,
            statistic,
            n_resamples=n_bootstrap,
            confidence_level=confidence,
            method='percentile',
            paired=True
        )
        ci_lower = float(np.atleast_1d(res.confidence_interval.low)[0])
        ci_upper = float(np.atleast_1d(res.confidence_interval.high)[0])
    except Exception:
        # Fallback if bootstrap fails
        ci_lower = None
        ci_upper = None

    return {
        'rho': float(rho),
        'p_value': float(p_value),
        'ci_lower': ci_lower,
        'ci_upper': ci_upper,
        'n': int(len(x_clean)),
        'significant': p_value < (1 - confidence)
    }


def cohens_d(group1: np.ndarray, group2: np.ndarray) -> Dict[str, Any]:
    """
    Cohen's d effect size for two groups.

    Interpretation:
        |d| < 0.2  = negligible
        0.2 - 0.5 = small
        0.5 - 0.8 = medium
        > 0.8     = large

    Args:
        group1: First group values
        group2: Second group values

    Returns:
        Dictionary with d value and magnitude interpretation
    """
    g1 = np.array(group1)[~np.isnan(group1)]
    g2 = np.array(group2)[~np.isnan(group2)]

    n1, n2 = len(g1), len(g2)

    if n1 < 2 or n2 < 2:
        return {'d': np.nan, 'magnitude': 'insufficient data'}

    var1 = np.var(g1, ddof=1)
    var2 = np.var(g2, ddof=1)

    # Pooled standard deviation
    pooled_std = np.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))

    if pooled_std == 0:
        return {'d': np.nan, 'magnitude': 'zero variance'}

    d = (np.mean(g1) - np.mean(g2)) / pooled_std

    # Magnitude interpretation
    abs_d = abs(d)
    if abs_d < 0.2:
        magnitude = 'negligible'
    elif abs_d < 0.5:
        magnitude = 'small'
    elif abs_d < 0.8:
        magnitude = 'medium'
    else:
        magnitude = 'large'

    return {
        'd': float(d),
        'magnitude': magnitude,
        'n1': int(n1),
        'n2': int(n2),
        'mean1': float(np.mean(g1)),
        'mean2': float(np.mean(g2))
    }


def minimum_detectable_effect(
    n: int,
    alpha: float = 0.05,
    power: float = 0.80
) -> Dict[str, Any]:
    """
    Calculate minimum detectable effect size given sample size.

    Args:
        n: Sample size (per group for two-sample test)
        alpha: Significance level
        power: Statistical power

    Returns:
        Dictionary with minimum detectable Cohen's d and interpretation
    """
    if n < 2:
        return {
            'n': n,
            'alpha': alpha,
            'power': power,
            'min_detectable_d': np.nan,
            'interpretation': 'Insufficient sample size'
        }

    try:
        analysis = TTestIndPower()
        effect_size = analysis.solve_power(
            effect_size=None,
            nobs1=n,
            alpha=alpha,
            power=power,
            ratio=1.0
        )
    except Exception:
        effect_size = np.nan

    return {
        'n': int(n),
        'alpha': float(alpha),
        'power': float(power),
        'min_detectable_d': float(effect_size) if not np.isnan(effect_size) else None,
        'interpretation': f"With n={n}, can detect Cohen's d >= {effect_size:.2f} at alpha={alpha}, power={power}" if not np.isnan(effect_size) else "Unable to compute"
    }


def apply_bonferroni_correction(
    p_values: List[float],
    alpha: float = 0.05
) -> Dict[str, Any]:
    """
    Apply Bonferroni correction for multiple comparisons.

    Args:
        p_values: List of p-values from multiple tests
        alpha: Family-wise error rate

    Returns:
        Dictionary with adjusted alpha, corrected significance
    """
    n_tests = len(p_values)
    adjusted_alpha = alpha / n_tests

    corrected = []
    for p in p_values:
        corrected.append({
            'original_p': float(p),
            'significant_uncorrected': p < alpha,
            'significant_corrected': p < adjusted_alpha
        })

    return {
        'n_tests': n_tests,
        'original_alpha': alpha,
        'adjusted_alpha': adjusted_alpha,
        'results': corrected,
        'significant_after_correction': sum(1 for r in corrected if r['significant_corrected'])
    }


def calculate_nps_delta(
    metric_values: np.ndarray,
    nps_values: np.ndarray,
    threshold: float
) -> Dict[str, Any]:
    """
    Calculate NPS delta for a given threshold.

    Args:
        metric_values: Array of metric values
        nps_values: Array of corresponding NPS values
        threshold: Threshold to split groups

    Returns:
        Dictionary with above/below means, delta, and effect size
    """
    mask = ~(np.isnan(metric_values) | np.isnan(nps_values))
    metric = np.array(metric_values)[mask]
    nps = np.array(nps_values)[mask]

    above_mask = metric > threshold
    below_mask = metric <= threshold

    above_nps = nps[above_mask]
    below_nps = nps[below_mask]

    if len(above_nps) == 0 or len(below_nps) == 0:
        return {
            'threshold': threshold,
            'n_above': len(above_nps),
            'n_below': len(below_nps),
            'nps_above': np.nan,
            'nps_below': np.nan,
            'nps_delta': np.nan,
            'cohens_d': np.nan,
            'effect_magnitude': 'insufficient data'
        }

    delta = np.mean(above_nps) - np.mean(below_nps)
    effect = cohens_d(above_nps, below_nps)

    return {
        'threshold': float(threshold),
        'n_above': int(len(above_nps)),
        'n_below': int(len(below_nps)),
        'nps_above': float(np.mean(above_nps)),
        'nps_below': float(np.mean(below_nps)),
        'nps_delta': float(delta),
        'cohens_d': effect['d'],
        'effect_magnitude': effect['magnitude']
    }
