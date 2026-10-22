# Platform decisions

Since [ADR-0126](adr-0126-a-knowledge-base-other-apps-read.md) the knowledge portal is a
stand-alone knowledge base that other apps read, and it numbers its own decisions from 0126 on.
Before that, the platform's decisions were made and numbered in
[requirement-portal](https://github.com/mohamhossam/requirement-portal/tree/main/docs/architecture),
and the ones this portal followed are copied here as history (ADR-0104). The copies
were taken on 2026-10-09 (0077, 0115 and 0116 on 2026-10-20; 0101 refreshed with its Amendment 3 on 2026-10-21); requirement-portal's are
authoritative if the two differ. ADRs this portal authors itself (0114, 0119–0124) are numbered in
the same platform-wide series.

| ADR | Decision |
|---|---|
| [0077](adr-0077-supply-chain-gates.md) | Supply-chain gates in CI |
| [0098](adr-0098-three-repo-platform.md) | Three repositories beside the original application |
| [0099](adr-0099-knowledge-service-boundary.md) | The knowledge service boundary and its own database |
| [0100](adr-0100-platform-kernel.md) | The platform kernel holds mechanisms, never meaning |
| [0101](adr-0101-product-architecture-explorer-on-the-catalogue.md) | The Product Architecture Explorer on the catalogue |
| [0102](adr-0102-historic-requirements-and-ado-lineage.md) | Historic Requirements and their Azure DevOps lineage |
| [0104](adr-0104-independent-portals-with-optional-links.md) | Independent portals with optional links (superseded by 0126) |
| [0114](adr-0114-capability-concepts-select-systems.md) | Curated capability concepts may select systems |
| [0115](adr-0115-product-verdict-in-requirement-analysis.md) | A requirement-level product verdict, decided in analysis |
| [0116](adr-0116-capability-concepts-reach-generation.md) | The decided product impact and its capability concepts reach generation |
| [0119](adr-0119-one-canonical-dependency-model.md) | One canonical dependency model |
| [0120](adr-0120-provenance-survives-acceptance.md) | Provenance survives acceptance |
| [0121](adr-0121-lifecycle-deprecation-and-replacement.md) | Lifecycle: deprecation and replacement |
| [0122](adr-0122-golden-set-report-runs.md) | Golden set report: stored runs on their own queue (proposed) |
| [0123](adr-0123-catalogue-model-open-questions.md) | Co-mastery, the remaining suggestion kinds, and library classification (proposed) |
| [0124](adr-0124-stable-offering-and-journey-ids.md) | Stable ids for offerings and journeys (proposed) |
| [0125](adr-0125-vocabularies-as-data.md) | Vocabularies as data, on one SKOS base (proposed) |
| [0126](adr-0126-a-knowledge-base-other-apps-read.md) | A knowledge base other apps read |
