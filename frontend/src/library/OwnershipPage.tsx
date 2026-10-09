import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { type AdminRecordEntry, api, type OwnershipTransfer } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { ActionGroup, Button, type Column, ConsequencePanel, DataTable, RadioGroup, Section, Skeleton, Status, TextField } from "../design/components";
import { useDisclosure } from "../design/hooks";
import { formatDay } from "../home/format";
import { useDocumentContext } from "./documentContext";
import { plural } from "./where";

const ACTION: Record<AdminRecordEntry["action"], string> = {
  grant: "Began acting as admin",
  end: "Stopped acting as admin",
  reassign: "Handed it over",
  confirm_review: "Confirmed it still right, for its owner",
  withdraw: "Withdrew it",
  review: "Saved a review",
  approve: "Published a version",
  retry_reading: "Tried reading again, with other documents",
  retry_indexing: "Tried indexing again, with other documents",
};

const timeOf = (value: string) => new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * Who owns the document, and handing it to another knowledge admin through a
 * consequence panel (§5): the new owner gets every private version and review,
 * the old owner keeps only what every admin sees. Then its history and the
 * admin record.
 */
export function OwnershipPage() {
  const { document } = useDocumentContext();
  const history = useQuery({ queryKey: ["library", "ownership", document.id], queryFn: () => api.ownershipHistory(document.id) });
  const transfers = [...(history.data ?? [])].reverse();
  const columns: Column<OwnershipTransfer>[] = [
    { id: "when", header: "When", rowHeader: true, width: "9rem", cell: (item) => formatDay(item.recorded_at) },
    {
      id: "what",
      header: "Handed over",
      cell: (item) => (
        <>
          From <bdi>{item.previous_owner.display_name}</bdi> to <bdi>{item.new_owner.display_name}</bdi>
          {item.performed_by.display_name !== item.previous_owner.display_name && (
            <span className="lib-detail lib-detail--plain">by <bdi>{item.performed_by.display_name}</bdi>{item.on_behalf ? `, as admin on ${item.previous_owner.display_name}'s behalf` : ""}</span>
          )}
          <span className="lib-detail lib-detail--plain" dir="auto">{item.reason}</span>
        </>
      ),
    },
  ];
  return (
    <div className="lib-stack">
      {document.can_edit ? <Transfer /> : (
        <Section title="Owner">
          <p><bdi>{document.owner.display_name}</bdi> owns it. To hand it over on their behalf, act as admin from the document's Overview first.</p>
        </Section>
      )}
      <Section title="Ownership history" count={history.isSuccess ? transfers.length : undefined}>
        {history.isError ? (
          <p role="status"><Status tone="attention">Couldn't read the history: {errorMessage(history.error)}</Status> <Button variant="link" onClick={() => void history.refetch()}>Try again</Button></p>
        ) : history.isPending ? (
          <Skeleton label="Reading the history" rows={2} />
        ) : transfers.length === 0 ? (
          <p className="lib-quiet"><bdi>{document.owner.display_name}</bdi> has owned it since it was added.</p>
        ) : (
          <DataTable caption="Ownership transfers, newest first" captionHidden columns={columns} rows={transfers} rowId={(item) => `${item.recorded_at}-${item.new_owner.display_name}`} />
        )}
      </Section>
      <AdminRecord />
    </div>
  );
}

/** Everything a knowledge admin did to this document without owning it, newest first. */
function AdminRecord() {
  const { document } = useDocumentContext();
  const record = useQuery({ queryKey: ["library", "admin-record", document.id], queryFn: () => api.adminRecord(document.id) });
  const entries = record.data ?? [];
  const columns: Column<AdminRecordEntry>[] = [
    { id: "when", header: "When", rowHeader: true, width: "11rem", cell: (entry) => <>{formatDay(entry.acted_at)}, {timeOf(entry.acted_at)}</> },
    {
      id: "what",
      header: "What, and why",
      cell: (entry) => (
        <>
          {ACTION[entry.action]} <span className="lib-quiet">by <bdi>{entry.admin.display_name}</bdi></span>
          {entry.reason && <span className="lib-detail lib-detail--plain" dir="auto">{entry.reason}</span>}
        </>
      ),
    },
  ];
  return (
    <Section title="Admin record" count={record.isSuccess ? entries.length : undefined}>
      <p className="lib-quiet">What knowledge admins did to it on its owner's behalf, and the library-wide retries that included it.</p>
      {record.isError ? (
        <p role="status"><Status tone="attention">Couldn't read the admin record: {errorMessage(record.error)}</Status> <Button variant="link" onClick={() => void record.refetch()}>Try again</Button></p>
      ) : record.isPending ? (
        <Skeleton label="Reading the admin record" rows={2} />
      ) : entries.length === 0 ? (
        <p className="lib-quiet">No admin has acted on it for its owner.</p>
      ) : (
        <DataTable caption="Admin record, newest first" captionHidden columns={columns} rows={entries} rowId={(entry) => entry.id} />
      )}
    </Section>
  );
}

function Transfer() {
  const { document, hook, dirty } = useDocumentContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const panel = useDisclosure(() => window.document.getElementById("hand-over"));
  const [find, setFind] = useState("");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(find.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [find]);
  const actors = useQuery({ queryKey: ["identity", "actors", query], queryFn: () => api.findActors(query), placeholderData: keepPreviousData });
  const candidates = (actors.data ?? []).filter((actor) => actor.id !== document.owner.id.value);
  const chosen = candidates.find((actor) => actor.id === target);
  // An admin acting for the owner may hand it on, or take it over themselves.
  const owner = document.owner.display_name;
  const acting = !document.is_owner;
  const me = document.acting_as_admin?.admin.id.value;
  const takingOver = acting && chosen !== undefined && chosen.id === me;
  const transfer = useMutation({
    mutationFn: (reason: string) => api.transfer(document.id, { expected_version: document.version, actor_id: target, reason }),
    onSuccess: (done) => {
      navigate("/library", {
        state: { notice: takingOver ? `You now own '${document.title}'.` : `'${document.title}' now belongs to ${done.new_owner.display_name}.` },
      });
      // After the page has left: what was private to us is gone, and the list has changed.
      window.setTimeout(() => {
        queryClient.removeQueries({ queryKey: ["library", "document", document.id] });
        queryClient.removeQueries({ queryKey: ["library", "ownership", document.id] });
        void queryClient.invalidateQueries({ queryKey: ["library", "documents"] });
      }, 0);
    },
  });
  const reasonWhy = !chosen ? "Choose the new owner first." : dirty > 0 ? `Save or discard the ${plural(dirty, "unsaved review change")} first.` : null;
  const name = chosen?.display_name ?? "";

  return (
    <Section title={acting ? "Hand it on, or take it over" : "Hand it to another knowledge admin"}>
      <p className="lib-quiet">
        {acting
          ? <><bdi>{owner}</bdi> owns it now, and you act for them as admin. Hand it to another knowledge admin, or take it over yourself.</>
          : <>You own it now. Only knowledge admins who have signed in to the portal can take it over.</>}
      </p>
      <div className="lib-transfer">
        <TextField label="Find an admin by name or email" type="search" autoComplete="off" spellCheck={false} value={find} onChange={(event) => setFind(event.target.value)} />
        {actors.isError ? (
          <p role="status"><Status tone="attention">Couldn't find admins: {errorMessage(actors.error)}</Status></p>
        ) : actors.isPending ? (
          <Skeleton label="Finding admins" rows={2} />
        ) : candidates.length === 0 ? (
          <p className="lib-quiet">No other admin matches.</p>
        ) : (
          <RadioGroup
            legend="New owner"
            name="new-owner"
            value={target}
            options={candidates.map((actor) => ({
              value: actor.id,
              label: <><bdi>{actor.display_name}</bdi>{acting && actor.id === me ? " (you)" : ""}</>,
              hint: actor.email ?? undefined,
            }))}
            onChange={(value) => setTarget(value)}
          />
        )}
        <ActionGroup>
          <Button id="hand-over" unavailableReason={panel.open ? null : reasonWhy} aria-expanded={panel.open} onClick={(event) => { transfer.reset(); if (panel.open) panel.close(); else panel.show(event); }}>
            {takingOver ? `Take it over from ${owner}…` : chosen ? `Hand it to ${name}…` : "Hand it over…"}
          </Button>
        </ActionGroup>
      </div>
      {panel.open && chosen && (
        <ConsequencePanel
          panelRef={panel.panel}
          title={takingOver ? <>Take '<bdi>{document.title}</bdi>' over from <bdi>{owner}</bdi></> : <>Hand '<bdi>{document.title}</bdi>' to <bdi>{name}</bdi></>}
          happens={<>{takingOver ? "You" : <bdi>{name}</bdi>} get{takingOver ? "" : "s"} every private version and review of it, and its re-confirmations.</>}
          affects={<p>{acting ? <><bdi>{owner}</bdi> keeps</> : "You keep"} only what every admin sees: the version in service.{acting ? " The change names you, as admin on their behalf." : ""}</p>}
          reversibility={takingOver ? "You can hand it back later." : `Only ${name}, or an admin acting for them, can hand it back.`}
          reason={{ label: acting ? "Why it changes hands" : "Why you are handing it over", hint: "Kept in its ownership history, which every admin sees." }}
          confirmLabel={takingOver ? <>Take it over from <bdi>{owner}</bdi></> : acting ? <>Hand it to <bdi>{name}</bdi> on <bdi>{owner}</bdi>'s behalf</> : <>Hand it to <bdi>{name}</bdi></>}
          busyLabel="Handing it over…"
          keepLabel="Keep it as it is"
          busy={transfer.isPending}
          failure={transfer.isError ? (transfer.error instanceof ApiError && transfer.error.status === 409 ? "The document changed while you were deciding. Reload it, then hand it over again." : errorMessage(transfer.error)) : null}
          onConfirm={(reason) => transfer.mutate(reason)}
          onKeep={panel.close}
        />
      )}
      {transfer.isError && transfer.error instanceof ApiError && transfer.error.status === 409 && (
        <p><Button variant="link" onClick={() => void hook.reload()}>Reload the document</Button></p>
      )}
    </Section>
  );
}
