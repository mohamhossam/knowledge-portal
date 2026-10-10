"""What a requirement does to the product portfolio (requirement-portal ADR-0115).

A requirement either changes an offering the release already has, adds a plan to one, or
needs a new offering, in an existing product family or in a new product line. The four
values follow the catalogue ontology review's rules of thumb:

- change to an existing offering: one offering covers every capability the requirement
  needs, for the same segment and channel;
- new plan or variant: an offering covers the capabilities, and the requirement changes a
  characteristic value such as speed, commitment or price tier;
- new offering in an existing family: systems realise the capabilities, but no one offering
  composes them, or the segment differs;
- new product line: the capabilities are realised nowhere, or the family itself is new.

A requirement too vague to place has no verdict; it needs questions answered first.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ProductVerdict(StrEnum):
    CHANGE_EXISTING_OFFERING = "change_existing_offering"
    NEW_PLAN = "new_plan"
    NEW_OFFERING_IN_FAMILY = "new_offering_in_family"
    NEW_PRODUCT_LINE = "new_product_line"

    @property
    def names_an_offering(self) -> bool:
        """Whether the verdict is about one offering the release already has."""
        return self in {ProductVerdict.CHANGE_EXISTING_OFFERING, ProductVerdict.NEW_PLAN}


@dataclass(frozen=True)
class OfferingFit:
    """How one offering fits what a requirement needs."""

    offering_id: str
    # The requirement names the offering, or one of its components.
    named: bool
    # The needed concepts its components require.
    composed: frozenset[str] = frozenset()
    # The needed concepts a system its delivery already uses realises.
    served: frozenset[str] = frozenset()
    # Its mandatory components the requirement leaves out.
    excluded: tuple[str, ...] = ()
    # Characteristic values the requirement sets that none of its plans has.
    new_values: tuple[str, ...] = ()
    # The requirement names a segment the offering is not sold to.
    other_segment: bool = False

    @property
    def covered(self) -> frozenset[str]:
        return self.composed | self.served


@dataclass(frozen=True)
class VerdictCall:
    """What the rules of thumb say, and why, in words a reviewer reads."""

    verdict: ProductVerdict | None
    offering_id: str | None
    reason: str


def decide_verdict(
    needed: frozenset[str],
    gaps: frozenset[str],
    fit: OfferingFit | None,
    new_family: bool = False,
) -> VerdictCall:
    """The verdict the rules of thumb give, before any model weighs in.

    `needed` are the concepts the requirement needs, `gaps` those of them no system
    realises, `fit` the offering in question (the one it names, else the one covering most
    of what it needs), and `new_family` whether it names a product family or line of
    business the portfolio does not have. With no need and no new characteristic value on
    a named offering, there is nothing to decide on: no verdict, and questions instead.
    """
    named = fit is not None and fit.named
    if not needed and not named:
        return VerdictCall(
            None, None, "Too vague to place: it names no offering and no capability it needs."
        )
    if new_family:
        return VerdictCall(
            ProductVerdict.NEW_PRODUCT_LINE,
            None,
            "It is for a product family or line of business the portfolio does not have.",
        )
    if gaps and not named:
        return VerdictCall(
            ProductVerdict.NEW_PRODUCT_LINE,
            None,
            f"{len(gaps)} of the {len(needed)} capabilities it needs are realised nowhere.",
        )
    if fit is None:
        return VerdictCall(
            ProductVerdict.NEW_OFFERING_IN_FAMILY,
            None,
            "Systems realise what it needs, but no offering composes it.",
        )
    if fit.other_segment:
        return VerdictCall(
            ProductVerdict.NEW_OFFERING_IN_FAMILY,
            None,
            "It is for a segment the offering is not sold to.",
        )
    if fit.excluded:
        return VerdictCall(
            ProductVerdict.NEW_OFFERING_IN_FAMILY,
            None,
            f"It leaves out {len(fit.excluded)} mandatory component(s) of the offering.",
        )
    uncovered = needed - fit.covered - gaps
    if uncovered and not named:
        return VerdictCall(
            ProductVerdict.NEW_OFFERING_IN_FAMILY,
            None,
            f"No one offering covers it: {len(uncovered)} of the {len(needed)} capabilities "
            "it needs are outside the closest one.",
        )
    if fit.new_values:
        return VerdictCall(
            ProductVerdict.NEW_PLAN,
            fit.offering_id,
            "It sets a characteristic value none of the offering's plans has: "
            + ", ".join(fit.new_values)
            + ".",
        )
    covered = len(needed & fit.covered)
    return VerdictCall(
        ProductVerdict.CHANGE_EXISTING_OFFERING,
        fit.offering_id,
        f"The offering covers {covered} of the {len(needed)} capabilities it needs"
        + (", and it names the offering." if named else ".")
        + (f" {len(gaps)} realised nowhere are gaps." if gaps else ""),
    )
