class HiddenWebIntelligenceError(Exception):
    """Base exception for hidden web intelligence errors."""


class PolicyViolationError(HiddenWebIntelligenceError):
    """Raised when a request violates safety policies."""


class BrowserStartupError(HiddenWebIntelligenceError):
    """Raised when browser startup fails."""


class NavigationError(HiddenWebIntelligenceError):
    """Raised when navigation or loading fails."""


class ExtractionError(HiddenWebIntelligenceError):
    """Raised when extraction/parsing fails."""


class SearchProviderError(HiddenWebIntelligenceError):
    """Raised when search or news providers fail."""

