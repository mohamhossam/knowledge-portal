"""HTTP schemas for the organisation catalogue: value streams, products, squads, people."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from knowledge_portal.domain.organisation.catalogue import (
    OrganisationAuditEvent,
    OrganisationCatalogue,
    Person,
    Product,
    ReferenceFlag,
    Squad,
    SquadResource,
    SquadRole,
    SystemOwnership,
    ValueStream,
)
from knowledge_portal.interfaces.api.schemas.bounds import (
    MAX_CATALOGUE_ITEMS,
    Identifier,
    Name,
    RequiredIdentifier,
    Text,
)


class PersonSchema(BaseModel):
    id: RequiredIdentifier
    name: Name
    email: Name | None = None
    team: Name | None = None
    active: bool = True
    revision: int = 1

    @classmethod
    def from_domain(cls, person: Person) -> PersonSchema:
        return cls.model_construct(
            id=person.id,
            name=person.name,
            email=person.email,
            team=person.team,
            active=person.active,
            revision=person.revision,
        )

    def to_domain(self) -> Person:
        return Person(self.id, self.name, self.email, self.team, self.active)


class ValueStreamSchema(BaseModel):
    id: RequiredIdentifier
    name: Name
    lead_person_id: Identifier | None = None
    revision: int = 1

    @classmethod
    def from_domain(cls, stream: ValueStream) -> ValueStreamSchema:
        return cls.model_construct(
            id=stream.id,
            name=stream.name,
            lead_person_id=stream.lead_person_id,
            revision=stream.revision,
        )

    def to_domain(self) -> ValueStream:
        return ValueStream(self.id, self.name, self.lead_person_id)


class ProductSchema(BaseModel):
    id: RequiredIdentifier
    value_stream_id: RequiredIdentifier
    name: Name
    description: Text = ""
    system_ids: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    offering_ids: list[Identifier] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    portfolio_node_id: Identifier | None = None
    revision: int = 1

    @classmethod
    def from_domain(cls, product: Product) -> ProductSchema:
        return cls.model_construct(
            id=product.id,
            value_stream_id=product.value_stream_id,
            name=product.name,
            description=product.description,
            system_ids=list(product.system_ids),
            offering_ids=list(product.offering_ids),
            portfolio_node_id=product.portfolio_node_id,
            revision=product.revision,
        )

    def to_domain(self) -> Product:
        return Product(
            self.id,
            self.value_stream_id,
            self.name,
            self.description,
            tuple(self.system_ids),
            tuple(self.offering_ids),
            self.portfolio_node_id,
        )


class SquadResourceSchema(BaseModel):
    """A seat on a system in a role; no person while the seat is open."""

    system_id: RequiredIdentifier
    role: SquadRole
    person_id: Identifier | None = None

    @classmethod
    def from_domain(cls, resource: SquadResource) -> SquadResourceSchema:
        return cls.model_construct(
            system_id=resource.system_id, role=resource.role, person_id=resource.person_id
        )


class SquadSchema(BaseModel):
    id: RequiredIdentifier
    name: Name
    value_stream_id: RequiredIdentifier
    scrum_master_person_id: Identifier | None = None
    resources: list[SquadResourceSchema] = Field(default=[], max_length=MAX_CATALOGUE_ITEMS)
    revision: int = 1

    @classmethod
    def from_domain(cls, squad: Squad) -> SquadSchema:
        return cls.model_construct(
            id=squad.id,
            name=squad.name,
            value_stream_id=squad.value_stream_id,
            scrum_master_person_id=squad.scrum_master_person_id,
            resources=[SquadResourceSchema.from_domain(item) for item in squad.resources],
            revision=squad.revision,
        )

    def to_domain(self) -> Squad:
        return Squad(
            self.id,
            self.name,
            self.value_stream_id,
            self.scrum_master_person_id,
            tuple(
                SquadResource(item.system_id, item.role, item.person_id) for item in self.resources
            ),
        )


class OrganisationResponse(BaseModel):
    people: list[PersonSchema]
    value_streams: list[ValueStreamSchema]
    products: list[ProductSchema]
    squads: list[SquadSchema]

    @classmethod
    def from_domain(cls, catalogue: OrganisationCatalogue) -> OrganisationResponse:
        return cls.model_construct(
            people=[PersonSchema.from_domain(item) for item in catalogue.people],
            value_streams=[ValueStreamSchema.from_domain(item) for item in catalogue.value_streams],
            products=[ProductSchema.from_domain(item) for item in catalogue.products],
            squads=[SquadSchema.from_domain(item) for item in catalogue.squads],
        )


class SystemOwnershipResponse(BaseModel):
    system_id: str
    squads: list[SquadSchema]
    products: list[ProductSchema]
    value_streams: list[ValueStreamSchema]

    @classmethod
    def from_domain(cls, ownership: SystemOwnership) -> SystemOwnershipResponse:
        return cls.model_construct(
            system_id=ownership.system_id,
            squads=[SquadSchema.from_domain(item) for item in ownership.squads],
            products=[ProductSchema.from_domain(item) for item in ownership.products],
            value_streams=[ValueStreamSchema.from_domain(item) for item in ownership.value_streams],
        )


class ReferenceFlagResponse(BaseModel):
    """A squad or product naming what the version in service no longer has, or a product
    whose systems differ from what its offerings name, or that is linked to nothing."""

    subject: Literal["squad", "product"]
    subject_id: str
    retired_system_ids: list[str]
    retired_offering_ids: list[str]
    retired_portfolio_node_id: str | None
    systems_missing: list[str]
    systems_unexplained: list[str]
    unlinked: bool

    @classmethod
    def from_domain(cls, flag: ReferenceFlag) -> ReferenceFlagResponse:
        return cls.model_construct(
            subject=flag.subject,
            subject_id=flag.subject_id,
            retired_system_ids=list(flag.retired_system_ids),
            retired_offering_ids=list(flag.retired_offering_ids),
            retired_portfolio_node_id=flag.retired_portfolio_node_id,
            systems_missing=list(flag.systems_missing),
            systems_unexplained=list(flag.systems_unexplained),
            unlinked=flag.unlinked,
        )


class OrganisationAuditEventResponse(BaseModel):
    actor_id: str
    action: str
    subject_id: str
    created_at: datetime

    @classmethod
    def from_domain(cls, event: OrganisationAuditEvent) -> OrganisationAuditEventResponse:
        return cls(
            actor_id=event.actor_id,
            action=event.action,
            subject_id=event.subject_id,
            created_at=event.created_at,
        )


class PersonRequest(BaseModel):
    """``expected_revision`` is omitted to create and required to update."""

    expected_revision: int | None = None
    person: PersonSchema


class ValueStreamRequest(BaseModel):
    expected_revision: int | None = None
    value_stream: ValueStreamSchema


class ProductRequest(BaseModel):
    expected_revision: int | None = None
    product: ProductSchema


class SquadRequest(BaseModel):
    expected_revision: int | None = None
    squad: SquadSchema


class RemovalRequest(BaseModel):
    expected_revision: int
