import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { api, type LibraryDocument } from "../api/client";
import { errorMessage } from "../api/errors";
import { Button, ConsequencePanel, Status } from "../design/components";
import { useDisclosure } from "../design/hooks";
import { formatDay } from "../home/format";
import { documentKey } from "./useDocument";

function timeOf(value: string): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function useRefresh(documentId: string) {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: documentKey(documentId) }),
    queryClient.invalidateQueries({ queryKey: ["library", "documents"] }),
    queryClient.invalidateQueries({ queryKey: ["library", "admin-record", documentId] }),
  ]);
}

/**
 * For a knowledge admin who doesn't own the document: whose it is, and acting
 * on the owner's behalf, with a reason (Knowledge Center C), asked in place
 * through a consequence panel (§5).
 */
export function ActAsAdmin({ document, onDone }: { document: LibraryDocument; onDone: (text: string) => void }) {
  const panel = useDisclosure();
  const refresh = useRefresh(document.id);
  const grant = useMutation({
    mutationFn: (reason: string) => api.openAdminGrant(document.id, reason),
    onSuccess: async (opened) => {
      await refresh();
      onDone(`You're acting as admin on ${document.owner.display_name}'s behalf until ${timeOf(opened.expires_at)}.`);
    },
  });
  const owner = document.owner.display_name;
  return (
    <div className="lib-admin">
      <p className="lib-admin__line">
        <bdi>{owner}</bdi> owns this document; only they review or change it.{" "}
        <Button variant="link" aria-expanded={panel.open} onClick={(event) => { grant.reset(); if (panel.open) panel.close(); else panel.show(event); }}>
          Act as admin on {owner}'s behalf…
        </Button>
      </p>
      {panel.open && (
        <ConsequencePanel
          panelRef={panel.panel}
          title={<>Act as admin on '<bdi>{document.title}</bdi>'</>}
          happens={<>For the next eight hours you see {owner}'s working copy, and can review, approve, hand over or withdraw it on their behalf.</>}
          affects={<p>Each change names you and this reason, and is kept in its admin record. Uploading new versions and building its search index for tables stay with {owner}.</p>}
          reversibility="You can stop acting as admin at any time from this page."
          reason={{ label: "Why", hint: `Kept with every change you make, in the admin record ${owner} sees.` }}
          confirmLabel="Act as admin"
          keepLabel="Cancel"
          busy={grant.isPending}
          failure={grant.isError ? errorMessage(grant.error) : null}
          onConfirm={(reason) => grant.mutate(reason)}
          onKeep={panel.close}
        />
      )}
    </div>
  );
}

/** While an admin acts for the owner: whose document, until when, why, and a way to stop. */
export function ActingBanner({ document, onDone }: { document: LibraryDocument; onDone: (text: string) => void }) {
  const grant = document.acting_as_admin;
  const refresh = useRefresh(document.id);
  const end = useMutation({
    mutationFn: () => api.endAdminGrant(document.id),
    onSuccess: async () => {
      await refresh();
      onDone(`You stopped acting as admin. ${document.owner.display_name} owns it as before.`);
    },
  });
  if (!grant) return null;
  return (
    <div className="lib-acting" role="region" aria-label="Acting as admin">
      <ShieldCheck size={16} aria-hidden="true" className="lib-acting__icon" />
      <p className="lib-acting__line">
        <strong>Acting as admin on <bdi>{document.owner.display_name}</bdi>'s behalf</strong> until {timeOf(grant.expires_at)}, {formatDay(grant.expires_at)}:{" "}
        <q dir="auto">{grant.reason}</q>
      </p>
      <Button variant="link" busy={end.isPending} onClick={() => end.mutate()}>{end.isPending ? "Stopping…" : "Stop acting as admin"}</Button>
      {end.isError && <p role="status"><Status tone="attention">{errorMessage(end.error)}</Status></p>}
    </div>
  );
}
