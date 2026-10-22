"""Each suggestion kind is classified and applied by its own handler, and none is missed."""

from __future__ import annotations

import pytest

from knowledge_portal.domain.architecture.candidates import (
    _APPLIERS,
    _CLASSIFIERS,
    CandidateKind,
    _every_kind,
)


def test_every_suggestion_kind_has_a_classifier() -> None:
    assert set(_CLASSIFIERS) == set(CandidateKind)


def test_every_suggestion_kind_has_an_applier() -> None:
    assert set(_APPLIERS) == set(CandidateKind)


def test_a_kind_without_a_handler_fails_loudly() -> None:
    forgotten: dict[CandidateKind, object] = {
        kind: _CLASSIFIERS[kind] for kind in CandidateKind if kind is not CandidateKind.SOURCE
    }
    with pytest.raises(NotImplementedError, match="No classifier for suggestion kinds: source"):
        _every_kind(forgotten, "classifier")
