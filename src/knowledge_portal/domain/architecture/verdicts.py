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
