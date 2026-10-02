"""Shared maximum sizes for request fields.

The body ceiling bounds a whole request; these bound each field inside it, so
an over-long value is a 422 naming the field before any use case runs. Several
of these fields reach a model prompt. The sizes match requirement-portal's
intake limits, so text moving between the portals fits both.

`tests/architecture/test_request_bounds.py` fails on any request string or list
without a maximum.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import Field

# Opaque identifiers, fingerprints and context tokens are UUIDs or a short
# prefix plus a SHA-256; 200 leaves room without admitting prose.
MAX_IDENTIFIER_CHARACTERS = 200
MAX_NAME_CHARACTERS = 300
MAX_SENTENCE_CHARACTERS = 1_000
MAX_TEXT_CHARACTERS = 10_000
# One request's worth of related items.
MAX_ITEMS = 50
# An architecture catalogue is edited whole, so its lists are larger.
MAX_CATALOGUE_ITEMS = 5_000
MAX_YAML_CHARACTERS = 1_000_000

Identifier = Annotated[str, Field(max_length=MAX_IDENTIFIER_CHARACTERS)]
RequiredIdentifier = Annotated[str, Field(min_length=1, max_length=MAX_IDENTIFIER_CHARACTERS)]
Name = Annotated[str, Field(max_length=MAX_NAME_CHARACTERS)]
Sentence = Annotated[str, Field(max_length=MAX_SENTENCE_CHARACTERS)]
Text = Annotated[str, Field(max_length=MAX_TEXT_CHARACTERS)]
RequiredText = Annotated[str, Field(min_length=1, max_length=MAX_TEXT_CHARACTERS)]
YamlDocument = Annotated[str, Field(max_length=MAX_YAML_CHARACTERS)]
