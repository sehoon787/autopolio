"""
GitHub Service Exceptions.

Extracted from github_service.py for better modularity and reuse.
"""


class GitHubServiceError(Exception):
    """Base exception for GitHub service errors."""

    def __init__(
        self, message: str, status_code: int = 500, original_error: Exception = None
    ):
        self.message = message
        self.status_code = status_code
        self.original_error = original_error
        super().__init__(self.message)


class GitHubRateLimitError(GitHubServiceError):
    """Raised when GitHub API rate limit is exceeded."""

    def __init__(
        self, message: str = "GitHub API 요청 한도 초과. 잠시 후 다시 시도하세요."
    ):
        super().__init__(message, status_code=429)


class GitHubNotFoundError(GitHubServiceError):
    """Raised when a GitHub resource is not found."""

    def __init__(self, message: str = "레포지토리를 찾을 수 없습니다."):
        super().__init__(message, status_code=404)


class GitHubTimeoutError(GitHubServiceError):
    """Raised when GitHub API request times out."""

    def __init__(
        self, message: str = "GitHub API 응답 시간 초과. 다시 시도해주세요."
    ):
        super().__init__(message, status_code=504)


class GitHubAuthError(GitHubServiceError):
    """Raised when GitHub authentication fails."""

    def __init__(
        self,
        message: str = "GitHub 인증이 만료되었거나 유효하지 않습니다. 다시 연동해주세요.",
    ):
        super().__init__(message, status_code=401)


# Convenience exports for backward compatibility
__all__ = [
    "GitHubServiceError",
    "GitHubRateLimitError",
    "GitHubNotFoundError",
    "GitHubTimeoutError",
    "GitHubAuthError",
]
