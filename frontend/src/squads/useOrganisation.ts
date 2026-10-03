import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useOutletContext } from "react-router-dom";

import { api, type Organisation, type OrgProduct, type Person, type Release, type Squad, type ValueStream } from "../api/client";

/** The squad catalogue, and every save to it. Each save returns the whole catalogue. */
export function useOrganisation() {
  const queryClient = useQueryClient();
  const organisation = useQuery({ queryKey: ["organisation"], queryFn: api.organisation });
  const active = useQuery({ queryKey: ["architecture", "active"], queryFn: api.activeRelease });
  const settle = (next: Organisation) => {
    queryClient.setQueryData(["organisation"], next);
    void queryClient.invalidateQueries({ queryKey: ["organisation"] });
  };
  const save = useMutation({
    mutationFn: ({ kind, record, isNew }: Save) => {
      const field = { people: "person", "value-streams": "value_stream", products: "product", squads: "squad" }[kind];
      return api.saveOrganisation(kind, record.id, { expected_revision: isNew ? null : record.revision, [field]: record }, isNew);
    },
    onSuccess: settle,
  });
  const remove = useMutation({
    mutationFn: ({ kind, record }: { kind: "value-streams" | "products" | "squads"; record: { id: string; revision: number } }) =>
      api.removeOrganisation(kind, record.id, record.revision),
    onSuccess: settle,
  });
  return { organisation, active, save, remove };
}

type Save =
  | { kind: "people"; record: Person; isNew: boolean }
  | { kind: "value-streams"; record: ValueStream; isNew: boolean }
  | { kind: "products"; record: OrgProduct; isNew: boolean }
  | { kind: "squads"; record: Squad; isNew: boolean };

export type OrgHook = ReturnType<typeof useOrganisation>;

/** The catalogue's history, newest first. */
export function useHistory() {
  return useQuery({ queryKey: ["organisation", "audit"], queryFn: api.organisationAudit });
}

/** What every squad catalogue page reads. */
export type OrgContext = { org: Organisation; release: Release | null; hook: OrgHook };

export function useOrgContext() {
  return useOutletContext<OrgContext>();
}
