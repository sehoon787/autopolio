"""
Analysis Job Service - Facade module for backward compatibility.

This module re-exports all components from the split modules:
- analysis_job_crud: AnalysisJobService class, AnalysisCancelledException
- analysis_job_runner: run_background_analysis function
"""

# Re-export from analysis_job_crud
from .analysis_job_crud import (
    AnalysisCancelledException,
    AnalysisJobService,
)

# Re-export from analysis_job_runner
from .analysis_job_runner import (
    run_background_analysis,
)

# Explicit exports for type checkers and IDE support
__all__ = [
    "AnalysisCancelledException",
    "AnalysisJobService",
    "run_background_analysis",
]
