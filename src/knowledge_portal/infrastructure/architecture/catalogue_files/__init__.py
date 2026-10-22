"""Excel, YAML and JSON catalogue files, all mapping to one catalogue structure.

YAML and JSON share the packaged catalogue's shape (``systems`` and
``dependencies``). Excel spreads the same content over one sheet per kind so
people can fill it in without learning a data format. Every parse error names
where it happened (sheet and row, or entry), because a maintainer has to find
and fix it in the file.

``fields`` reads one value and says where it failed. ``mapping_reading`` and
``offering_reading`` read the YAML/JSON shape, and ``mapping_writing`` writes it.
``workbook_sheets`` lays out the workbook; ``workbook_reading`` and ``offering_sheets``
gather its rows into the YAML/JSON shape, and ``workbook_writing`` writes it. ``adapter``
chooses between the formats.
"""

from knowledge_portal.infrastructure.architecture.catalogue_files.adapter import (
    CatalogueFileAdapter,
)
from knowledge_portal.infrastructure.architecture.catalogue_files.mapping_reading import (
    content_from_mapping,
)

__all__ = ["CatalogueFileAdapter", "content_from_mapping"]
