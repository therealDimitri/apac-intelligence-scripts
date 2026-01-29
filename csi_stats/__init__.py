"""
CSI Statistical Analysis Package

Provides reproducible statistical analysis for CSI factor model validation.
"""

from .extract import (
    get_supabase,
    extract_nps,
    extract_cases,
    extract_sla,
    extract_events,
    extract_meetings,
    extract_clc,
    build_client_metrics
)

from .statistics import (
    spearman_with_ci,
    cohens_d,
    minimum_detectable_effect,
    apply_bonferroni_correction
)

from .validation import (
    loocv_accuracy,
    roc_analysis,
    compare_models,
    threshold_sensitivity,
    calculate_arm_v1,
    calculate_arm_v2
)

from .reporting import (
    generate_markdown_report,
    generate_json_output,
    plot_correlation_heatmap,
    plot_roc_curves,
    plot_threshold_sensitivity
)

__version__ = '1.0.0'
__all__ = [
    # Extract
    'get_supabase',
    'extract_nps',
    'extract_cases',
    'extract_sla',
    'extract_events',
    'extract_meetings',
    'extract_clc',
    'build_client_metrics',
    # Statistics
    'spearman_with_ci',
    'cohens_d',
    'minimum_detectable_effect',
    'apply_bonferroni_correction',
    # Validation
    'loocv_accuracy',
    'roc_analysis',
    'compare_models',
    'threshold_sensitivity',
    'calculate_arm_v1',
    'calculate_arm_v2',
    # Reporting
    'generate_markdown_report',
    'generate_json_output',
    'plot_correlation_heatmap',
    'plot_roc_curves',
    'plot_threshold_sensitivity',
]
