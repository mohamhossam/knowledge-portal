"""Whether one OpenAPI contract can replace another, and what version that takes.

The app contract is public API for every app that reads the knowledge base (AGENTS.md §2.1):
it changes only additively, or with a new MAJOR version released with its apps. Review
recommendation 11 found that rule had nothing to pin against, so this module compares two
versions of a contract and says what changed:

- **breaking**: something a caller relies on is gone or means another thing. An operation,
  parameter, response or schema is removed; a type changes; a request needs a field, a
  parameter or a stricter value it did not; a response may now leave out or null a field it
  always sent; an enum loses a value.
- **additive**: something new a caller may ignore. A new operation, an optional request field
  or parameter, a response field, an enum value, a looser request constraint.
- **docs**: only descriptions, titles, summaries or examples differ.

``required_bump`` turns that into the semantic version step the change needs: a breaking change
raises MAJOR, an additive one MINOR, and a docs-only one nothing. ``version_problems`` checks a
new version against it.

Request and response schemas are told apart by what reaches them: a schema reached from a
request body or a parameter is read from callers; one reached from a response is sent to them;
one reached from both is held to both rules.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any

_METHODS = ("get", "put", "post", "delete", "patch", "head", "options", "trace")
# Keys that describe, never constrain: changing them is a docs change.
_ANNOTATIONS = frozenset({"description", "title", "summary", "example", "examples"})
# Keys whose values are maps of names, where an annotation key is a name, not an annotation.
_NAMED = frozenset({"properties", "schemas", "paths", "responses", "content", "headers", "mapping"})
# A request constraint that a larger value loosens, and one that a larger value tightens.
_UPPER = ("maxLength", "maximum", "exclusiveMaximum", "maxItems", "maxProperties")
_LOWER = ("minLength", "minimum", "exclusiveMinimum", "minItems", "minProperties")
_REF = "#/components/schemas/"


class Bump(IntEnum):
    NONE = 0
    PATCH = 1
    MINOR = 2
    MAJOR = 3


@dataclass
class Comparison:
    breaking: list[str] = field(default_factory=list)
    additive: list[str] = field(default_factory=list)
    # True when the files differ in descriptions only.
    docs: bool = False


def shape(node: Any, named: bool = False) -> Any:
    """A contract without what only describes it, and without its version."""
    if isinstance(node, dict):
        if named:
            return {key: shape(value) for key, value in node.items()}
        return {
            key: shape(value, key in _NAMED)
            for key, value in node.items()
            if key not in _ANNOTATIONS and key != "info"
        }
    if isinstance(node, list):
        return [shape(item) for item in node]
    return node


def _operations(contract: dict[str, Any]) -> Iterator[tuple[str, dict[str, Any]]]:
    for path, item in (contract.get("paths") or {}).items():
        for method in _METHODS:
            if method in item:
                yield f"{method.upper()} {path}", item[method]


def _refs(node: Any) -> Iterator[str]:
    if isinstance(node, dict):
        reference = node.get("$ref")
        if isinstance(reference, str) and reference.startswith(_REF):
            yield reference.removeprefix(_REF)
        for value in node.values():
            yield from _refs(value)
    elif isinstance(node, list):
        for item in node:
            yield from _refs(item)


def _reached(contract: dict[str, Any], roots: list[Any]) -> set[str]:
    schemas = (contract.get("components") or {}).get("schemas") or {}
    seen: set[str] = set()
    todo = [name for root in roots for name in _refs(root)]
    while todo:
        name = todo.pop()
        if name in seen or name not in schemas:
            continue
        seen.add(name)
        todo.extend(_refs(schemas[name]))
    return seen


def sides(contract: dict[str, Any]) -> tuple[set[str], set[str]]:
    """The schemas callers send (request bodies, parameters) and those they receive."""
    requests: list[Any] = []
    responses: list[Any] = []
    for _, operation in _operations(contract):
        requests.append(operation.get("requestBody"))
        requests.append(operation.get("parameters"))
        responses.append(operation.get("responses"))
    return _reached(contract, requests), _reached(contract, responses)


@dataclass(frozen=True)
class _Side:
    request: bool
    response: bool


def _variants(schema: dict[str, Any]) -> list[Any]:
    return [shape(item) for item in schema.get("anyOf") or schema.get("oneOf") or []]


def _compare_schema(old: Any, new: Any, where: str, side: _Side, found: Comparison) -> None:
    if not isinstance(old, dict) or not isinstance(new, dict):
        if shape(old) != shape(new):
            found.breaking.append(f"{where}: changed from {old!r} to {new!r}")
        return
    if old.get("$ref") != new.get("$ref"):
        found.breaking.append(f"{where}: now {new.get('$ref') or 'inline'}, was {old.get('$ref')}")
        return
    if old.get("type") != new.get("type"):
        found.breaking.append(f"{where}: type {old.get('type')} is now {new.get('type')}")
        return
    if old.get("format") != new.get("format"):
        found.breaking.append(f"{where}: format {old.get('format')} is now {new.get('format')}")
    old_values, new_values = old.get("enum"), new.get("enum")
    if old_values is not None or new_values is not None:
        lost = [item for item in old_values or [] if item not in (new_values or [])]
        gained = [item for item in new_values or [] if item not in (old_values or [])]
        if lost or (old_values is None and new_values is not None):
            found.breaking.append(f"{where}: no longer takes {lost or 'any value'}")
        if gained and old_values is not None:
            found.additive.append(f"{where}: also takes {gained}")
    old_variants, new_variants = _variants(old), _variants(new)
    if old_variants or new_variants:
        removed = [item for item in old_variants if item not in new_variants]
        added = [item for item in new_variants if item not in old_variants]
        if removed and side.request:
            found.breaking.append(f"{where}: no longer accepts {removed}")
        if added and side.response:
            found.breaking.append(f"{where}: may now send {added}")
        if (removed and not side.request) or (added and not side.response):
            found.additive.append(f"{where}: its variants changed")
    if "items" in old or "items" in new:
        _compare_schema(old.get("items"), new.get("items"), f"{where}[]", side, found)
    for key in _UPPER + _LOWER + ("pattern",):
        before, after = old.get(key), new.get(key)
        if before == after:
            continue
        tighter = after is not None and (
            before is None
            or (key in _UPPER and after < before)
            or (key in _LOWER and after > before)
            or key == "pattern"
        )
        if tighter and side.request:
            found.breaking.append(f"{where}: {key} {before} is now {after} for callers")
        else:
            found.additive.append(f"{where}: {key} {before} is now {after}")
    _compare_properties(old, new, where, side, found)


def _compare_properties(
    old: dict[str, Any], new: dict[str, Any], where: str, side: _Side, found: Comparison
) -> None:
    before = old.get("properties") or {}
    after = new.get("properties") or {}
    was_required = set(old.get("required") or [])
    now_required = set(new.get("required") or [])
    for name in before:
        if name not in after:
            found.breaking.append(f"{where}.{name}: removed")
    for name, schema in after.items():
        place = f"{where}.{name}"
        if name not in before:
            if name in now_required and side.request:
                found.breaking.append(f"{place}: a new field callers must send")
            else:
                found.additive.append(f"{place}: added")
            continue
        if name in now_required and name not in was_required and side.request:
            found.breaking.append(f"{place}: callers must now send it")
        if name in was_required and name not in now_required and side.response:
            found.breaking.append(f"{place}: may now be left out of what is sent")
        _compare_schema(before[name], schema, place, side, found)


def _parameters(operation: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    return {(item["in"], item["name"]): item for item in operation.get("parameters") or []}


def compare(base: dict[str, Any], head: dict[str, Any]) -> Comparison:
    """What changed from ``base`` to ``head``, sorted into breaking and additive."""
    found = Comparison()
    # The version itself is not a change; a changed description is.
    bodies = [{key: value for key, value in item.items() if key != "info"} for item in (base, head)]
    found.docs = bodies[0] != bodies[1] and shape(base) == shape(head)
    old_operations, new_operations = dict(_operations(base)), dict(_operations(head))
    for name, old in old_operations.items():
        new = new_operations.get(name)
        if new is None:
            found.breaking.append(f"{name}: removed")
            continue
        old_parameters, new_parameters = _parameters(old), _parameters(new)
        for key in old_parameters:
            if key not in new_parameters:
                found.breaking.append(f"{name}: parameter {key[1]} removed")
        for key, parameter in new_parameters.items():
            place = f"{name}: parameter {key[1]}"
            if key not in old_parameters:
                if parameter.get("required"):
                    found.breaking.append(f"{place} is new and required")
                else:
                    found.additive.append(f"{place} added")
                continue
            if parameter.get("required") and not old_parameters[key].get("required"):
                found.breaking.append(f"{place} is now required")
            _compare_schema(
                old_parameters[key].get("schema"),
                parameter.get("schema"),
                place,
                _Side(request=True, response=False),
                found,
            )
        old_body, new_body = old.get("requestBody"), new.get("requestBody")
        if old_body is None and new_body is not None and new_body.get("required"):
            found.breaking.append(f"{name}: now requires a body")
        if old_body is not None and new_body is None:
            found.breaking.append(f"{name}: no longer takes a body")
        for status in old.get("responses") or {}:
            if status not in (new.get("responses") or {}):
                found.breaking.append(f"{name}: response {status} removed")
    for name in new_operations:
        if name not in old_operations:
            found.additive.append(f"{name}: added")
    old_schemas = (base.get("components") or {}).get("schemas") or {}
    new_schemas = (head.get("components") or {}).get("schemas") or {}
    requests, responses = sides(head)
    old_requests, old_responses = sides(base)
    for name, schema in old_schemas.items():
        if name not in new_schemas:
            found.breaking.append(f"{name}: schema removed")
            continue
        side = _Side(
            request=name in requests or name in old_requests,
            response=name in responses or name in old_responses,
        )
        _compare_schema(schema, new_schemas[name], name, side, found)
    for name in new_schemas:
        if name not in old_schemas:
            found.additive.append(f"{name}: schema added")
    return found


def required_bump(found: Comparison) -> Bump:
    if found.breaking:
        return Bump.MAJOR
    if found.additive:
        return Bump.MINOR
    return Bump.PATCH if found.docs else Bump.NONE


def parse_version(text: str) -> tuple[int, int, int]:
    parts = text.split(".")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        raise ValueError(f"A contract version is MAJOR.MINOR.PATCH, not {text!r}.")
    major, minor, patch = (int(part) for part in parts)
    return major, minor, patch


def version_problems(base_version: str, head_version: str, bump: Bump) -> list[str]:
    """What is wrong with ``head_version`` for a change that needs ``bump``; empty when fine.

    A version never goes back. A breaking change raises MAJOR; an additive change raises MINOR
    (or MAJOR); a docs-only change or none needs no raise.
    """
    base, head = parse_version(base_version), parse_version(head_version)
    if head < base:
        return [f"The version went back from {base_version} to {head_version}."]
    if bump is Bump.MAJOR and head[0] <= base[0]:
        return [
            f"A breaking change needs a new major version: {base[0] + 1}.0.0, not {head_version}."
        ]
    if bump is Bump.MINOR and head[:2] <= base[:2]:
        return [
            f"An additive change needs a new minor version: {base[0]}.{base[1] + 1}.0, not "
            f"{head_version}."
        ]
    return []
