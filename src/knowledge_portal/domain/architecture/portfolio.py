"""The product portfolio: where each offering sits, such as Enterprise › Fixed › SMB.

Levels are data. A node says what level it is ("Business unit", "Line of
business", "Segment", "Product family") and which node it sits under, so any
operator's portfolio fits without a code change. Offerings name the node they
sit in (TM Forum SID: a category of the product catalogue).
"""

from __future__ import annotations

from dataclasses import dataclass

from knowledge_portal.domain.architecture.invariants import (
    InvalidKnowledgeError,
    optional,
    required,
)
from knowledge_portal.domain.architecture.sources import SourceConfidence, check_source


@dataclass(frozen=True)
class PortfolioNode:
    id: str
    name: str
    # What level of the portfolio it is, in the operator's own words.
    level: str
    parent_id: str | None = None
    description: str | None = None
    confidence: SourceConfidence | None = None
    source: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", required(self.id, "Portfolio node id"))
        object.__setattr__(self, "name", required(self.name, "Portfolio node name"))
        object.__setattr__(self, "level", required(self.level, "Portfolio level"))
        object.__setattr__(self, "parent_id", optional(self.parent_id, "Parent portfolio node"))
        object.__setattr__(self, "description", optional(self.description, "Description"))
        if self.parent_id == self.id:
            raise InvalidKnowledgeError(f"{self.name} cannot sit under itself.")
        check_source(self)


def check_portfolio(nodes: tuple[PortfolioNode, ...]) -> set[str]:
    """Unique ids, known parents, no cycles, and names unique among siblings.

    Returns the node ids, for checking what offerings name.
    """
    by_id = {node.id: node for node in nodes}
    if len(by_id) != len(nodes):
        raise InvalidKnowledgeError("Portfolio node ids must be unique.")
    siblings: set[tuple[str | None, str]] = set()
    for node in nodes:
        if node.parent_id is not None and node.parent_id not in by_id:
            raise InvalidKnowledgeError(
                f"{node.name} sits under {node.parent_id!r}, which is not in the portfolio."
            )
        key = (node.parent_id, node.name.casefold().strip())
        if key in siblings:
            raise InvalidKnowledgeError(
                f"Two portfolio nodes under the same parent are both called {node.name!r}."
            )
        siblings.add(key)
        seen = {node.id}
        parent = by_id.get(node.parent_id or "")
        while parent is not None:
            if parent.id in seen:
                raise InvalidKnowledgeError(f"{node.name} sits under itself in the portfolio.")
            seen.add(parent.id)
            parent = by_id.get(parent.parent_id or "")
    return set(by_id)
