"""The catalogue file adapter: each format to and from catalogue content."""

from __future__ import annotations

import json

import yaml

from knowledge_portal.application.ports.catalogue_file import CatalogueContent, CatalogueFileFormat
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    InvalidKnowledgeError,
)
from knowledge_portal.infrastructure.architecture.catalogue_files.mapping_reading import (
    content_from_mapping,
)
from knowledge_portal.infrastructure.architecture.catalogue_files.mapping_writing import (
    release_to_mapping,
)
from knowledge_portal.infrastructure.architecture.catalogue_files.workbook_reading import (
    _read_workbook,
)
from knowledge_portal.infrastructure.architecture.catalogue_files.workbook_writing import _workbook


class CatalogueFileAdapter:
    def read(self, file_format: CatalogueFileFormat, content: bytes) -> CatalogueContent:
        if file_format is CatalogueFileFormat.XLSX:
            return _read_workbook(content)
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise InvalidKnowledgeError("The catalogue file must be UTF-8 text.") from exc
        try:
            raw = (
                json.loads(text)
                if file_format is CatalogueFileFormat.JSON
                else yaml.safe_load(text)
            )
        except (json.JSONDecodeError, yaml.YAMLError) as exc:
            raise InvalidKnowledgeError(
                f"The {file_format.value.upper()} file could not be parsed: {_position(exc)}."
            ) from exc
        return content_from_mapping(raw)

    def write(self, file_format: CatalogueFileFormat, release: ArchitectureKnowledge) -> bytes:
        if file_format is CatalogueFileFormat.XLSX:
            return _workbook(release)
        mapping = release_to_mapping(release)
        if file_format is CatalogueFileFormat.JSON:
            return json.dumps(mapping, ensure_ascii=False, indent=2).encode()
        return yaml.safe_dump(mapping, allow_unicode=True, sort_keys=False).encode()

    def template(self) -> bytes:
        return _workbook(None)


def _position(exc: json.JSONDecodeError | yaml.YAMLError) -> str:
    if isinstance(exc, json.JSONDecodeError):
        return f"line {exc.lineno}, column {exc.colno}"
    mark = getattr(exc, "problem_mark", None)
    return f"line {mark.line + 1}" if mark is not None else "invalid syntax"
