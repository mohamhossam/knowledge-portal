"""Human administration of architecture knowledge, independent of HTTP and storage."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime
from uuid import uuid4

from knowledge_portal.application.ports.architecture_knowledge_repository import (
    ArchitectureKnowledgeRepositoryPort,
)
from knowledge_portal.application.ports.architecture_rag import (
    ArchitectureEvidenceIndexPort,
    ChunkEntityLink,
    EntityRole,
    EvidenceChunk,
    IndexCoverage,
)
from knowledge_portal.application.ports.catalogue_file import (
    CatalogueFileFormat,
    CatalogueFilePort,
)
from knowledge_portal.application.ports.identity import (
    Actor,
    require_maintainer,
    require_reader,
)
from knowledge_portal.application.use_cases.architecture_evidence import readable
from knowledge_portal.domain.architecture.channels import Channel
from knowledge_portal.domain.architecture.concepts import BusinessCapability
from knowledge_portal.domain.architecture.diff import CatalogueDiff, diff_releases
from knowledge_portal.domain.architecture.governance import KnowledgeSource, SourceConflict
from knowledge_portal.domain.architecture.identity import renamed_journey, renamed_offering
from knowledge_portal.domain.architecture.interfaces import SystemInterface
from knowledge_portal.domain.architecture.journeys import Journey
from knowledge_portal.domain.architecture.knowledge import (
    ArchitectureKnowledge,
    CapabilityDomain,
    InvalidKnowledgeError,
    KnowledgeAuditEvent,
    KnowledgeConflictError,
    KnowledgeDocumentVersion,
    KnowledgeReleaseStatus,
    LandscapeDomain,
    OutdatedPassage,
    SystemDefinition,
    SystemRelationship,
    version_name,
)
from knowledge_portal.domain.architecture.portfolio import PortfolioNode
from knowledge_portal.domain.architecture.products import ProductOffering
from knowledge_portal.domain.architecture.realisations import RealisationRecord
from knowledge_portal.domain.architecture.vocabularies import VocabularyTerm


class KnowledgeNotFoundError(Exception):
    """An architecture release does not exist."""


class ManageArchitectureKnowledge:
    def __init__(
        self,
        repository: ArchitectureKnowledgeRepositoryPort,
        files: CatalogueFilePort,
        index: ArchitectureEvidenceIndexPort,
        max_file_bytes: int,
    ) -> None:
        self._repository = repository
        self._files = files
        self._index = index
        self.max_file_bytes = max_file_bytes

    def list_releases(self, actor: Actor) -> tuple[ArchitectureKnowledge, ...]:
        """Every release, drafts included; maintainers only."""
        require_maintainer(actor)
        return self._repository.list_all()

    def view_active(self, actor: Actor) -> ArchitectureKnowledge:
        require_reader(actor)
        return self._repository.active()

    def view(self, release_id: str, actor: Actor) -> ArchitectureKnowledge:
        """A release the actor may read: published to readers, drafts to maintainers."""
        require_reader(actor)
        release = self.get(release_id)
        if release.status is not KnowledgeReleaseStatus.PUBLISHED:
            require_maintainer(actor)
        return release

    def index_coverage(self, release_id: str, actor: Actor) -> IndexCoverage | None:
        """How much of the release's evidence index its links reach; None when the release
        has no index yet, or its index predates links."""
        require_maintainer(actor)
        release = self.get(release_id)
        if release.built_revision is None or not release.index_id:
            return None
        return self._index.coverage(release.index_id)

    def get(self, release_id: str) -> ArchitectureKnowledge:
        release = self._repository.get(release_id)
        if release is None:
            raise KnowledgeNotFoundError(f"Architecture release {release_id!r} not found.")
        return release

    def evidence(self, release_id: str, chunk_id: str, actor: Actor) -> EvidenceChunk:
        require_reader(actor)
        release = self.get(release_id)
        if release.status is not KnowledgeReleaseStatus.PUBLISHED:
            require_maintainer(actor)
        chunk = self._index.get(release.index_id or release.id, chunk_id)
        if chunk is None:
            raise KnowledgeNotFoundError("Architecture evidence was not found.")
        return chunk

    def published_evidence(self, release_id: str, chunk_id: str) -> EvidenceChunk:
        """Evidence of a published release, for requirement work's read-only viewer.

        Requirement work asks on behalf of any signed-in member (requirement-portal
        ADR-0099), so a draft is never shown this way: it answers as if absent.
        """
        release = self._repository.get(release_id)
        if release is None or release.status is not KnowledgeReleaseStatus.PUBLISHED:
            raise KnowledgeNotFoundError("Architecture evidence was not found.")
        chunk = self._index.get(release.index_id or release.id, chunk_id)
        if chunk is None:
            raise KnowledgeNotFoundError("Architecture evidence was not found.")
        return chunk

    def preview(self, release_id: str, query: str, actor: Actor) -> tuple[EvidenceChunk, ...]:
        require_maintainer(actor)
        release = self.get(release_id)
        if release.built_revision != release.revision or not self._index.reads(
            release.index_profile
        ):
            raise KnowledgeConflictError("Build this release with the current embedding profile.")
        if not query.strip():
            raise InvalidKnowledgeError("Retrieval query must not be blank.")
        index_id = release.index_id or release.id
        # Children are what is searched; a preview shows what would be read (ADR section-v4).
        return readable(self._index, index_id, self._index.retrieve(index_id, query, 8))

    def named_in(self, release_id: str, chunk_id: str, actor: Actor) -> tuple[ChunkEntityLink, ...]:
        """The catalogue systems and offerings a passage names (section-v4 indexes only)."""
        chunk = self.evidence(release_id, chunk_id, actor)
        release = self.get(release_id)
        entities, _ = self._index.links(release.index_id or release.id, (chunk.id,))
        return tuple(item for item in entities if item.role is EntityRole.MENTIONS)

    def active(self) -> ArchitectureKnowledge:
        return self._repository.active()

    def audit(self, release_id: str, actor: Actor) -> tuple[KnowledgeAuditEvent, ...]:
        require_maintainer(actor)
        self.get(release_id)
        return self._repository.audit(release_id)

    def document_versions(self, actor: Actor) -> tuple[KnowledgeDocumentVersion, ...]:
        require_reader(actor)
        return self._repository.document_versions(actor.may_maintain_knowledge)

    def known_versions(self) -> dict[str, KnowledgeDocumentVersion]:
        """Every document version ever uploaded, published or not, by id."""
        return {item.id: item for item in self._repository.document_versions(True)}

    def mark_outdated(
        self,
        release_id: str,
        expected_revision: int,
        passages: tuple[OutdatedPassage, ...],
        actor: Actor,
    ) -> ArchitectureKnowledge:
        """Replace the draft's outdated passages: each stays readable, never searched."""
        require_maintainer(actor)
        current = self.get(release_id)
        held = {item.id for item in current.documents}
        if any(item.version_id not in held for item in passages):
            raise InvalidKnowledgeError("An outdated passage must be of a document in the draft.")
        return self.update(
            release_id,
            expected_revision,
            actor,
            outdated_passages=tuple(dict.fromkeys(passages)),
        )

    def earlier_versions(self, version: KnowledgeDocumentVersion) -> tuple[str, ...]:
        """The ids of the versions a document version replaced, newest first."""
        known = {item.id: item for item in self._repository.document_versions(True)}
        found: list[str] = []
        current = version.supersedes
        while current is not None and current not in found:
            found.append(current)
            earlier = known.get(current)
            current = earlier.supersedes if earlier else None
        return tuple(found)

    def document_version(self, version_id: str, actor: Actor) -> KnowledgeDocumentVersion:
        version = next(
            (item for item in self.document_versions(actor) if item.id == version_id), None
        )
        if version is None:
            raise KnowledgeNotFoundError("Architecture document version was not found.")
        return version

    def create_draft(self, actor: Actor, name: str) -> ArchitectureKnowledge:
        """Start the one version in progress, copied from the version in use."""
        require_maintainer(actor)
        label = version_name(name)
        in_progress = next(
            (
                item
                for item in self._repository.list_all()
                if item.status is KnowledgeReleaseStatus.DRAFT
            ),
            None,
        )
        if in_progress is not None:
            taken = in_progress.name or in_progress.id
            starter = f", started by {in_progress.created_by}" if in_progress.created_by else ""
            raise KnowledgeConflictError(
                f"'{taken}' is already in progress{starter}. Publish or discard it first."
            )
        current = self._repository.active()
        draft = replace(
            current,
            id=f"draft-{uuid4().hex}",
            revision=1,
            status=KnowledgeReleaseStatus.DRAFT,
            built_revision=None,
            index_profile=None,
            index_hash=None,
            index_id=None,
            published_at=None,
            published_by=None,
            name=label,
            created_by=actor.id,
        )
        self._repository.save(draft, None, actor.id, "create_draft")
        return draft

    def rename(
        self, release_id: str, expected_revision: int, name: str, actor: Actor
    ) -> ArchitectureKnowledge:
        require_maintainer(actor)
        current = self.get(release_id)
        if current.status is not KnowledgeReleaseStatus.DRAFT:
            raise KnowledgeConflictError("Only a version in progress can be renamed.")
        if current.revision != expected_revision:
            raise KnowledgeConflictError("The draft changed; reload before renaming.")
        # A name is not content: the build stays valid, so no `updated()` here.
        renamed = replace(current, revision=current.revision + 1, name=version_name(name))
        if current.built_revision == current.revision:
            renamed = replace(renamed, built_revision=renamed.revision)
        self._repository.save(renamed, expected_revision, actor.id, "rename")
        return renamed

    def discard_draft(self, release_id: str, expected_revision: int, actor: Actor) -> None:
        """Delete a version in progress nobody wants, with its suggestions."""
        require_maintainer(actor)
        current = self.get(release_id)
        if current.status is not KnowledgeReleaseStatus.DRAFT:
            raise KnowledgeConflictError("Only a version in progress can be discarded.")
        self._repository.delete_draft(release_id, expected_revision, actor.id)
        # Its indexes go with it, then the chunk sets only they read.
        self._index.prune(release_id, keep="")
        self._index.collect()

    def update(
        self,
        release_id: str,
        expected_revision: int,
        actor: Actor,
        *,
        systems: tuple[SystemDefinition, ...] | None = None,
        relationships: tuple[SystemRelationship, ...] | None = None,
        capability_domains: tuple[CapabilityDomain, ...] | None = None,
        landscape_domains: tuple[LandscapeDomain, ...] | None = None,
        products: tuple[ProductOffering, ...] | None = None,
        journeys: tuple[Journey, ...] | None = None,
        channels: tuple[Channel, ...] | None = None,
        sources: tuple[KnowledgeSource, ...] | None = None,
        conflicts: tuple[SourceConflict, ...] | None = None,
        portfolio: tuple[PortfolioNode, ...] | None = None,
        business_capabilities: tuple[BusinessCapability, ...] | None = None,
        vocabulary: tuple[VocabularyTerm, ...] | None = None,
        interfaces: tuple[SystemInterface, ...] | None = None,
        realisations: tuple[RealisationRecord, ...] | None = None,
        outdated_passages: tuple[OutdatedPassage, ...] | None = None,
    ) -> ArchitectureKnowledge:
        require_maintainer(actor)
        current = self.get(release_id)
        if current.revision != expected_revision:
            raise KnowledgeConflictError("The draft changed; reload before saving.")
        updated = current.updated(
            systems=current.systems if systems is None else systems,
            relationships=current.relationships if relationships is None else relationships,
            capability_domains=capability_domains,
            landscape_domains=landscape_domains,
            products=products,
            journeys=journeys,
            channels=channels,
            sources=sources,
            conflicts=conflicts,
            portfolio=portfolio,
            business_capabilities=business_capabilities,
            vocabulary=vocabulary,
            interfaces=interfaces,
            realisations=realisations,
            outdated_passages=outdated_passages,
        )
        self._repository.save(updated, expected_revision, actor.id, "edit_draft")
        return updated

    def upsert_system(
        self, release_id: str, expected_revision: int, system: SystemDefinition, actor: Actor
    ) -> ArchitectureKnowledge:
        require_maintainer(actor)
        current = self.get(release_id)
        systems = tuple(item for item in current.systems if item.id != system.id) + (system,)
        return self.update(release_id, expected_revision, actor, systems=systems)

    def remove_system(
        self, release_id: str, expected_revision: int, system_id: str, actor: Actor
    ) -> ArchitectureKnowledge:
        require_maintainer(actor)
        current = self.get(release_id)
        systems = tuple(item for item in current.systems if item.id != system_id)
        if len(systems) == len(current.systems):
            raise KnowledgeNotFoundError(f"System {system_id!r} not found.")
        return self.update(release_id, expected_revision, actor, systems=systems)

    def upsert_offering(
        self, release_id: str, expected_revision: int, offering: ProductOffering, actor: Actor
    ) -> ArchitectureKnowledge:
        """Add an offering, or replace the one with its id, leaving every other untouched."""
        require_maintainer(actor)
        current = self.get(release_id)
        kept = tuple(item for item in current.products if item.id != offering.id)
        at = next((n for n, item in enumerate(current.products) if item.id == offering.id), None)
        products = (*kept, offering) if at is None else (*kept[:at], offering, *kept[at:])
        return self.update(release_id, expected_revision, actor, products=products)

    def remove_offering(
        self, release_id: str, expected_revision: int, offering_id: str, actor: Actor
    ) -> ArchitectureKnowledge:
        require_maintainer(actor)
        current = self.get(release_id)
        products = tuple(item for item in current.products if item.id != offering_id)
        if len(products) == len(current.products):
            raise KnowledgeNotFoundError(f"Offering {offering_id!r} not found.")
        return self.update(release_id, expected_revision, actor, products=products)

    def upsert_journey(
        self, release_id: str, expected_revision: int, journey: Journey, actor: Actor
    ) -> ArchitectureKnowledge:
        """Add a journey, or replace the one with its id, leaving every other untouched."""
        require_maintainer(actor)
        current = self.get(release_id)
        kept = tuple(item for item in current.journeys if item.id != journey.id)
        at = next((n for n, item in enumerate(current.journeys) if item.id == journey.id), None)
        journeys = (*kept, journey) if at is None else (*kept[:at], journey, *kept[at:])
        return self.update(release_id, expected_revision, actor, journeys=journeys)

    def remove_journey(
        self, release_id: str, expected_revision: int, journey_id: str, actor: Actor
    ) -> ArchitectureKnowledge:
        require_maintainer(actor)
        current = self.get(release_id)
        journeys = tuple(item for item in current.journeys if item.id != journey_id)
        if len(journeys) == len(current.journeys):
            raise KnowledgeNotFoundError(f"Journey {journey_id!r} not found.")
        return self.update(release_id, expected_revision, actor, journeys=journeys)

    def rename_offering(
        self, release_id: str, expected_revision: int, old_id: str, new_id: str, actor: Actor
    ) -> ArchitectureKnowledge:
        """Give an offering a new id, keeping the old one as a former id and moving every
        reference in the version to the new one."""
        require_maintainer(actor)
        current = self.get(release_id)
        products, journeys, conflicts = renamed_offering(
            current.products, current.journeys, current.conflicts, old_id, new_id
        )
        return self.update(
            release_id,
            expected_revision,
            actor,
            products=products,
            journeys=journeys,
            conflicts=conflicts,
        )

    def rename_journey(
        self, release_id: str, expected_revision: int, old_id: str, new_id: str, actor: Actor
    ) -> ArchitectureKnowledge:
        require_maintainer(actor)
        current = self.get(release_id)
        return self.update(
            release_id,
            expected_revision,
            actor,
            journeys=renamed_journey(current.journeys, old_id, new_id),
        )

    def mark_built(
        self,
        release_id: str,
        expected_revision: int,
        profile: str,
        content_hash: str,
        actor_id: str,
        index_id: str,
    ) -> ArchitectureKnowledge:
        current = self.get(release_id)
        if (
            current.status is not KnowledgeReleaseStatus.DRAFT
            or current.revision != expected_revision
        ):
            raise KnowledgeConflictError("The build no longer matches the draft.")
        if not current.systems:
            raise InvalidKnowledgeError("A release needs at least one system.")
        updated = replace(
            current,
            built_revision=current.revision,
            index_profile=profile,
            index_hash=content_hash,
            index_id=index_id,
        )
        self._repository.save(updated, expected_revision, actor_id, "build_index")
        return updated

    def publish(
        self,
        release_id: str,
        expected_revision: int,
        actor: Actor,
        published_at: datetime,
        rationale: str,
    ) -> ArchitectureKnowledge:
        require_maintainer(actor)
        if not rationale.strip():
            raise InvalidKnowledgeError("Publication rationale is required.")
        current = self.get(release_id)
        if (
            current.status is not KnowledgeReleaseStatus.DRAFT
            or current.revision != expected_revision
        ):
            raise KnowledgeConflictError("The draft changed; reload before publishing.")
        if current.built_revision != current.revision:
            raise KnowledgeConflictError("Build the current draft before publishing.")
        if not current.index_id or not current.index_profile or not current.index_hash:
            raise KnowledgeConflictError("The draft has no complete index profile.")
        if current.index_profile != self._index.profile:
            raise KnowledgeConflictError("The embedding profile changed; rebuild the draft.")
        release = replace(
            current,
            status=KnowledgeReleaseStatus.PUBLISHED,
            published_at=published_at,
            published_by=actor.id,
        )
        self._repository.publish(release, expected_revision, rationale)
        return release

    def activate(self, release_id: str, actor: Actor, rationale: str) -> ArchitectureKnowledge:
        require_maintainer(actor)
        if not rationale.strip():
            raise InvalidKnowledgeError("Reactivation rationale is required.")
        release = self.get(release_id)
        if release.id != "smb-source-reference-v1" and not self._index.reads(release.index_profile):
            raise KnowledgeConflictError(
                "This historical index uses a different embedding profile; create a new draft."
            )
        self._repository.activate(release.id, actor.id, rationale)
        return release

    def _imported(self, release_id: str, filename: str, content: bytes) -> ArchitectureKnowledge:
        """The draft as it would be with the file's systems, relationships and domains."""
        current = self.get(release_id)
        if current.status is not KnowledgeReleaseStatus.DRAFT:
            raise KnowledgeConflictError("Only a draft can take an imported catalogue.")
        if len(content) > self.max_file_bytes:
            raise InvalidKnowledgeError("The catalogue file is too large.")
        if not content:
            raise InvalidKnowledgeError("The catalogue file is empty.")
        imported = self._files.read(CatalogueFileFormat.from_filename(filename), content)
        return replace(
            current,
            systems=imported.systems,
            relationships=imported.relationships,
            capability_domains=imported.capability_domains,
            landscape_domains=imported.landscape_domains,
            products=imported.products,
            journeys=imported.journeys,
            channels=imported.channels,
            sources=imported.sources,
            conflicts=imported.conflicts,
            change_history=(
                current.change_history
                if imported.change_history is None
                else imported.change_history
            ),
            portfolio=imported.portfolio,
            business_capabilities=imported.business_capabilities,
            vocabulary=imported.vocabulary,
            interfaces=imported.interfaces,
            realisations=imported.realisations,
        )

    def preview_file_import(
        self, release_id: str, filename: str, content: bytes, actor: Actor
    ) -> CatalogueDiff:
        """What importing the file would change in the draft; nothing is saved."""
        require_maintainer(actor)
        return diff_releases(self.get(release_id), self._imported(release_id, filename, content))

    def apply_file_import(
        self,
        release_id: str,
        expected_revision: int,
        filename: str,
        content: bytes,
        actor: Actor,
    ) -> ArchitectureKnowledge:
        """Replace the draft's systems, relationships and domains; its documents stay."""
        require_maintainer(actor)
        imported = self._imported(release_id, filename, content)
        return self.update(
            release_id,
            expected_revision,
            actor,
            systems=imported.systems,
            relationships=imported.relationships,
            capability_domains=imported.capability_domains,
            landscape_domains=imported.landscape_domains,
            products=imported.products,
            journeys=imported.journeys,
            channels=imported.channels,
            sources=imported.sources,
            conflicts=imported.conflicts,
            portfolio=imported.portfolio,
            business_capabilities=imported.business_capabilities,
            vocabulary=imported.vocabulary,
            interfaces=imported.interfaces,
            realisations=imported.realisations,
        )

    def export_file(self, release_id: str, file_format: CatalogueFileFormat, actor: Actor) -> bytes:
        return self._files.write(file_format, self.view(release_id, actor))

    def file_template(self, actor: Actor) -> bytes:
        require_maintainer(actor)
        return self._files.template()

    def changes(self, release_id: str, actor: Actor, base_id: str | None = None) -> CatalogueDiff:
        """How a release differs from another: the one in service unless a base is named.

        Any two versions compare, in either order, so a curator can see what one published
        version changed from the one before it (Knowledge Center C).
        """
        require_maintainer(actor)
        base = self._repository.active() if base_id is None else self.get(base_id)
        return diff_releases(base, self.get(release_id))

    def select_documents(
        self,
        release_id: str,
        expected_revision: int,
        actor: Actor,
        version_ids: tuple[str, ...],
    ) -> ArchitectureKnowledge:
        require_maintainer(actor)
        if len(version_ids) != len(set(version_ids)):
            raise InvalidKnowledgeError("Document versions must be selected once each.")
        known = {version.id: version for version in self._repository.document_versions(True)}
        if any(version_id not in known for version_id in version_ids):
            raise InvalidKnowledgeError("A selected document version does not exist.")
        current = self.get(release_id)
        if current.revision != expected_revision:
            raise KnowledgeConflictError("The draft changed; reload before saving.")
        updated = current.updated(documents=tuple(known[item] for item in version_ids))
        self._repository.save(updated, expected_revision, actor.id, "select_documents")
        return updated
