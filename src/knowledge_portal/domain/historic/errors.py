"""Errors of historic Requirements (Knowledge Center E)."""


class InvalidHistoricRequirementError(Exception):
    """What was asked of a historic requirement is malformed (a title, a reason, its links)."""


class HistoricRequirementStateError(Exception):
    """It is not in a state that allows this: drafts are edited, published ones refreshed."""


class HistoricPublicationSupersededError(Exception):
    """The publication asked for is no longer the one in use; a newer one has been published."""
