"""No Azure DevOps connection: BRDs are still read, but no breakdown can be (ADR-0102)."""

from knowledge_portal.application.ports.ado_work_items import (
    AdoNotConfiguredError,
    Progress,
    WorkItemTree,
)


class UnconfiguredAdoWorkItemSource:
    def read_tree(
        self, root_ids: tuple[int, ...], max_items: int, progress: Progress
    ) -> WorkItemTree:
        raise AdoNotConfiguredError(
            "No Azure DevOps connection is configured, so the breakdown cannot be read. "
            "Ask an administrator to set ADO_PROVIDER."
        )
