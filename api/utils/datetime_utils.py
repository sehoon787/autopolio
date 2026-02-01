"""
DateTime Utilities - Common date/time formatting functions
"""

from datetime import datetime


def get_formatted_date(fmt: str = "%Y-%m-%d") -> str:
    """
    Get current date formatted according to the given format string.

    Args:
        fmt: strftime format string (default: "%Y-%m-%d")

    Returns:
        Formatted date string
    """
    return datetime.now().strftime(fmt)


def get_timestamp() -> str:
    """
    Get a timestamp string suitable for filenames.

    Returns:
        Timestamp in format 'YYYYMMDD_HHMMSS'
    """
    return datetime.now().strftime("%Y%m%d_%H%M%S")
