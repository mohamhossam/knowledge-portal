"""Search breaks equal scores the same way every time."""

from __future__ import annotations

from knowledge_portal.infrastructure.persistence.reference_index import fuse


def test_equal_fused_scores_are_ordered_by_content_hash_not_by_id() -> None:
    # "z-id" and "a-id" each rank first in one list and second in the other: an exact tie.
    ties = {"z-id": "0001", "a-id": "ffff"}

    assert fuse(["z-id", "a-id"], ["a-id", "z-id"], 10, ties) == ("z-id", "a-id")
    # The same chunks under new ids (a rebuild) keep their order, because their content does.
    rebuilt = {"m-id": "0001", "b-id": "ffff"}
    assert fuse(["b-id", "m-id"], ["m-id", "b-id"], 10, rebuilt) == ("m-id", "b-id")


def test_a_higher_fused_score_still_wins_over_the_tie_key() -> None:
    ties = {"low": "0000", "high": "ffff"}

    assert fuse(["high", "low"], ["high"], 10, ties) == ("high", "low")
