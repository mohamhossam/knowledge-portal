import "./offering/offering.css";

import { Pencil } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";

import type { ChangeRecord, KnowledgeSource, Release, SourceConflict } from "../api/client";
import {
  Button, EmptyState, Facts, GapBadge, Lines, ListFilter, ListFind, ListTools, RecordList, type RecordGroup, RecordPlaceholder, RecordView,
  Section, Status, Workbench,
} from "../design/components";
import { count, formatDay } from "../home/format";
import { RouterLink } from "../shell/links";
import { sourceUses } from "./drafting";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import { useFindParam } from "./frame/useFindParam";
import { ConflictsEdit, SourcesEdit } from "./GovernanceEditor";
import { Level, NOT_SUPPLIED, Provenance } from "./GovernanceSections";
import { byLevel, ITEM_STATUS, LEVEL, levelTag } from "./governance";
import { traceLine } from "./inbox";
import { useCatalogueContext } from "./useCatalogue";

/** The three registers, as the address names them: governance/conflicts/CF-01. */
type Register = "conflicts" | "sources" | "changes";
type Editing = "sources" | "conflicts";

const ALL = "all";
const REGISTER_LABEL: Record<Register, string> = {
  conflicts: "Conflicts between sources",
  sources: "Sources",
  changes: "Change requests applied",
};

const fold = (text: string) => text.normalize("NFKC").toLocaleLowerCase();
const at = (base: string, register: Register, id: string) => `${base}/governance/${register}/${encodeURIComponent(id)}`;

/**
 * Where the catalogue's knowledge comes from, and where its sources disagree
 * (ADR-0101, step 5), on the workbench (UX rebuild,
 * phase 3). Its three registers are lists of records, so they share one
 * narrow list, grouped by register: the conflicts between sources first (each
 * needs a decision), then the sources by level, then the change requests
 * applied to this version. The chosen one is read beside it. On a draft, the
 * sources and the conflicts are each edited whole, in place of the record.
 */
export function GovernancePage() {
  const { register, itemId } = useParams();
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const [editing, setEditing] = useState<Editing | null>(null);
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    if (editing === null && returnTo.current) {
      document.getElementById(returnTo.current)?.focus();
      returnTo.current = null;
    }
  }, [editing]);
  const close = (key: Editing) => () => {
    returnTo.current = `governance-edit-${key}`;
    setEditing(null);
  };

  const conflict = register === "conflicts" ? (release.conflicts ?? []).find((item) => item.id === itemId) : undefined;
  const source = register === "sources" ? (release.sources ?? []).find((item) => item.id === itemId) : undefined;
  const change = register === "changes" ? (release.change_history ?? []).find((item) => item.id === itemId) : undefined;
  const chosenName = conflict?.title ?? source?.title ?? change?.title;
  const edit = (key: Editing) => <EditRegister register={key} onEdit={() => setEditing(key)} />;

  const record =
    editing === "sources" ? (
      <SourcesEdit onDone={close("sources")} />
    ) : editing === "conflicts" ? (
      <ConflictsEdit onDone={close("conflicts")} />
    ) : conflict ? (
      <ConflictRecord key={conflict.id} conflict={conflict} action={edit("conflicts")} />
    ) : source ? (
      <SourceRecord key={source.id} source={source} action={edit("sources")} />
    ) : change ? (
      <ChangeRecordView key={change.id} record={change} />
    ) : itemId !== undefined ? (
      <EmptyState
        title={`This version has nothing called “${itemId}” among its ${(REGISTER_LABEL[register as Register] ?? "registers").toLocaleLowerCase()}.`}
        action={<RouterLink href={`${base}/governance`}>See every source and conflict</RouterLink>}
      />
    ) : (
      <Summary release={release} edit={edit} />
    );

  return (
    <>
      <CatalogueHeader page="governance" chosen={chosenName} />
      <Workbench
        listLabel="Sources, conflicts and change requests"
        chosen={Boolean(chosenName) || editing !== null}
        list={<GovernanceList current={register && itemId ? `${register}:${itemId}` : undefined} />}
        record={record}
      />
    </>
  );
}

/** "Edit the sources", on a draft only; it opens the whole register in place of the record. */
function EditRegister({ register, onEdit }: { register: Editing; onEdit: () => void }) {
  const { editable } = useCatalogueContext();
  if (!editable) return null;
  return (
    <Button id={`governance-edit-${register}`} icon={<Pencil size={16} />} onClick={onEdit}>
      {register === "sources" ? "Edit the sources" : "Edit the conflicts"}
    </Button>
  );
}

function GovernanceList({ current }: { current?: string }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const [params, setParams] = useSearchParams();
  const show = (["conflicts", "sources", "changes"] as const).find((item) => item === params.get("show")) ?? ALL;
  const [find, setFind] = useFindParam();
  const sources = useMemo(() => release.sources ?? [], [release.sources]);
  const conflicts = useMemo(() => release.conflicts ?? [], [release.conflicts]);
  const history = useMemo(() => release.change_history ?? [], [release.change_history]);
  const total = sources.length + conflicts.length + history.length;

  const groups = useMemo<RecordGroup[]>(() => {
    const query = params.size ? `?${params}` : "";
    const wanted = fold(find.trim());
    const matches = (...texts: (string | null | undefined)[]) => !wanted || texts.some((text) => text && fold(text).includes(wanted));
    const shown = (register: Register) => show === ALL || show === register;
    return [
      {
        id: "conflicts",
        label: REGISTER_LABEL.conflicts,
        items: shown("conflicts")
          ? conflicts.filter((item) => matches(item.id, item.title, item.difference)).map((item) => ({
              id: `conflicts:${item.id}`,
              href: `${at(base, "conflicts", item.id)}${query}`,
              name: item.title,
              bidi: true,
              detail: <>{item.id} · {affectsLine(release, item)}</>,
              meta: <GapBadge gaps={item.decision ? [] : ["the decision it needs"]} />,
            }))
          : [],
      },
      {
        id: "sources",
        label: REGISTER_LABEL.sources,
        items: shown("sources")
          ? byLevel(sources).filter((item) => matches(item.id, item.title, item.short, item.authority)).map((item) => ({
              id: `sources:${item.id}`,
              href: `${at(base, "sources", item.id)}${query}`,
              name: item.title,
              bidi: true,
              detail: [`${item.level} ${LEVEL[item.level].word}`, item.short, item.version && `version ${item.version}`].filter(Boolean).join(" · "),
              meta: item.supplied === false ? <Status tone="attention">Not supplied</Status> : undefined,
            }))
          : [],
      },
      {
        id: "changes",
        label: REGISTER_LABEL.changes,
        items: shown("changes")
          ? history.filter((item) => matches(item.id, item.title, item.reason)).map((item) => ({
              id: `changes:${item.id}`,
              href: `${at(base, "changes", item.id)}${query}`,
              name: item.title,
              bidi: true,
              detail: [item.id, item.applied_at && `applied ${formatDay(item.applied_at)}`].filter(Boolean).join(" · "),
            }))
          : [],
      },
    ];
  }, [release, sources, conflicts, history, show, find, base, params]);
  const shownCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <ListTools count={show === ALL && !find.trim() ? count(total, "record") : `${count(shownCount, "record")} of ${total}`}>
        {total > 0 && <ListFind label="Find a source, conflict or change request" value={find} onChange={setFind} placeholder="Id, title or what it says" />}
        {total > 0 && <ListFilter
          label="Register"
          value={show}
          options={[
            { id: ALL, label: "Every register", count: total },
            { id: "conflicts", label: REGISTER_LABEL.conflicts, count: conflicts.length },
            { id: "sources", label: REGISTER_LABEL.sources, count: sources.length },
            { id: "changes", label: REGISTER_LABEL.changes, count: history.length },
          ]}
          onChange={(value) =>
            setParams((previous) => {
              const next = new URLSearchParams(previous);
              if (value === ALL) next.delete("show");
              else next.set("show", value);
              return next;
            }, { replace: true })
          }
        />}
      </ListTools>
      <RecordList
        label="Sources, conflicts and change requests of this version"
        groups={groups}
        currentId={current}
        link={RouterLink}
        empty={find.trim() ? `Nothing here is known by “${find.trim()}”.` : total ? "This register is empty." : "This version records no source, conflict or change request yet."}
      />
    </>
  );
}

/** With nothing chosen: what the registers hold, what needs a decision, and the edits a draft offers. */
function Summary({ release, edit }: { release: Release; edit: (key: Editing) => ReactNode }) {
  const { editable } = useCatalogueContext();
  const sources = release.sources ?? [];
  const conflicts = release.conflicts ?? [];
  const history = release.change_history ?? [];
  const undecided = conflicts.filter((item) => !item.decision).length;
  const unsupplied = sources.filter((item) => item.supplied === false).length;
  const levels = (["L1", "L2", "L3"] as const).map((level) => ({ level, n: sources.filter((item) => item.level === level).length })).filter((item) => item.n);
  return (
    <RecordPlaceholder title="Where this version’s knowledge comes from, and where its sources disagree. Choose a record to read it.">
      <section className="cat-tally" aria-label="What the registers hold">
        <dl className="cat-tally__list">
          <div>
            <dt>Conflicts between sources</dt>
            <dd>
              <strong>{conflicts.length}</strong>
              <span>{conflicts.length ? (undecided ? `${undecided} without the decision ${undecided === 1 ? "it needs" : "they need"} stated` : "Each states the decision it needs") : "None recorded"}</span>
            </dd>
          </div>
          <div>
            <dt>Sources</dt>
            <dd>
              <strong>{sources.length}</strong>
              <span>{[levels.map((item) => `${item.level} ${item.n}`).join(" · "), unsupplied && `${unsupplied} not supplied`].filter(Boolean).join("; ") || "None registered"}</span>
            </dd>
          </div>
          <div>
            <dt>Change requests applied</dt>
            <dd><strong>{history.length}</strong><span>From connected apps and the original explorer</span></dd>
          </div>
        </dl>
      </section>
      <p className="cat-lead">
        L1 is the canonical landscape, L2 a primary source for its scope, L3 a baseline carried forward. The catalogue never picks one side
        of a conflict; each needs a decision. Change requests are applied by accepting them from a draft, never edited by hand.
      </p>
      {editable && (
        <div className="cat-actions ds-actions">
          {edit("sources")}
          {edit("conflicts")}
        </div>
      )}
    </RecordPlaceholder>
  );
}

/** What a conflict affects, in words: "Business Pro Plus: New Activation", or that it affects no offering yet. */
function affectsLine(release: Release, conflict: SourceConflict): string {
  if (!conflict.scope.length) return "Affects no offering yet";
  return conflict.scope
    .map((scope) => {
      const offering = (release.products ?? []).find((item) => item.id === scope.product_id);
      return offering?.name ?? scope.product_id;
    })
    .join(", ");
}

function ConflictRecord({ conflict, action }: { conflict: SourceConflict; action: ReactNode }) {
  const { book, base } = useCatalogueContext();
  const location = useLocation();
  const release = book.release;
  const sources = release.sources ?? [];
  const said = (side: SourceConflict["a"]) => {
    const source = sources.find((item) => item.id === side.source_id);
    const name = source ? `${source.short ?? source.title} ${levelTag(source)}` : side.source_id;
    return [name, side.reference].filter(Boolean).join(" ");
  };
  return (
    <RecordView
      title={conflict.title}
      takeFocus={location.key !== "default"}
      meta={
        <>
          <span className="offering-id">{conflict.id}</span>
          {!conflict.decision && <Status tone="attention">Decision not stated</Status>}
        </>
      }
      lead={conflict.difference || undefined}
      actions={action}
    >
      <Section title="What each source says" headingLevel={3}>
        <dl className="offering-sides">
          {[conflict.a, conflict.b].map((side, index) => (
            <div key={index}>
              <dt dir="auto">{said(side)}</dt>
              <dd dir="auto">{side.statement}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Decision needed" headingLevel={3}>
        {conflict.decision ? <p className="offering-due" dir="auto">{conflict.decision}</p> : <p><Status tone="attention">Not stated</Status></p>}
        {conflict.impact && <p className="cat-lead" dir="auto">Meanwhile: {conflict.impact}</p>}
        <Provenance item={conflict} />
      </Section>
      <Section title="What it affects" count={conflict.scope.length} headingLevel={3}>
        {conflict.scope.length ? (
          <Lines>
            {conflict.scope.map((scope) => {
              const offering = (release.products ?? []).find((item) => item.id === scope.product_id);
              const orders = (scope.order_types ?? []).map((code) => offering?.order_types.find((type) => type.code === code)?.name ?? code);
              return (
                <li key={scope.product_id}>
                  Affects{" "}
                  <Link to={`${base}/offerings/${encodeURIComponent(scope.product_id)}?tab=governance`}><bdi>{offering?.name ?? scope.product_id}</bdi></Link>
                  {orders.length ? `: ${orders.join(", ")}` : ", every order type"}
                  {scope.question_id && <>, raises <span className="offering-id">{scope.question_id}</span></>}
                </li>
              );
            })}
          </Lines>
        ) : (
          <p className="cat-quiet">It affects no offering yet.</p>
        )}
      </Section>
    </RecordView>
  );
}

function SourceRecord({ source, action }: { source: KnowledgeSource; action: ReactNode }) {
  const { book, base } = useCatalogueContext();
  const location = useLocation();
  const release = book.release;
  const offerings = (release.products ?? []).filter((item) => (item.sources ?? []).includes(source.id) || item.primary_source === source.id);
  const conflicts = (release.conflicts ?? []).filter((item) => item.a.source_id === source.id || item.b.source_id === source.id);
  const uses = sourceUses(release, source.id).length;
  return (
    <RecordView
      title={source.title}
      takeFocus={location.key !== "default"}
      meta={
        <>
          <Level level={source.level} />
          {source.supplied === false && <Status tone="attention">{NOT_SUPPLIED}</Status>}
        </>
      }
      lead={source.authority ? <>The authority for: {source.authority}</> : undefined}
      actions={action}
    >
      <Facts
        items={[
          ["Level", LEVEL[source.level].long],
          ...(source.short ? [["Cited as", <bdi key="short">{source.short}</bdi>] as [string, ReactNode]] : []),
          ...(source.version ? [["Version", <bdi key="version">{source.version}</bdi>] as [string, ReactNode]] : []),
          ...(source.file ? [["File", <bdi key="file">{source.file}</bdi>] as [string, ReactNode]] : []),
          ["Covers", source.scope ? <bdi key="scope">{source.scope}</bdi> : <span className="cat-quiet">Not stated</span>],
          ["Cannot tell", source.boundary ? <bdi key="boundary">{source.boundary}</bdi> : <span className="cat-quiet">Not stated</span>],
        ]}
      />
      <Section title="Named by" count={uses} headingLevel={3}>
        {uses ? (
          <Lines>
            {offerings.map((offering) => (
              <li key={`o:${offering.id}`}>
                The offering <Link to={`${base}/offerings/${encodeURIComponent(offering.id)}?tab=governance`}><bdi>{offering.name}</bdi></Link>
                {offering.primary_source === source.id && <span className="cat-detail">Its primary source</span>}
              </li>
            ))}
            {conflicts.map((conflict) => (
              <li key={`c:${conflict.id}`}>
                The conflict <Link to={at(base, "conflicts", conflict.id)}><bdi>{conflict.title}</bdi></Link>
              </li>
            ))}
          </Lines>
        ) : (
          <p className="cat-quiet">No offering or conflict names it.</p>
        )}
      </Section>
    </RecordView>
  );
}

/** A change request applied to this version: who asked and why, and what it changed. History is never edited by hand. */
function ChangeRecordView({ record }: { record: ChangeRecord }) {
  const { book, base } = useCatalogueContext();
  const location = useLocation();
  const offering = record.product_id ? (book.release.products ?? []).find((item) => item.id === record.product_id) : undefined;
  return (
    <RecordView
      title={record.title}
      takeFocus={location.key !== "default"}
      meta={
        <>
          <span className="offering-id">{record.id}</span>
          <span>{record.origin === "explorer" ? "Drafted in the original explorer" : "From a connected app"}</span>
        </>
      }
      lead={record.reason ? <>Why: {record.reason}</> : undefined}
    >
      <Facts
        items={[
          ...(record.trace ? [["Requirement", <bdi key="trace">{traceLine(record.trace)}</bdi>] as [string, ReactNode]] : []),
          ...(record.requester && record.requester !== record.trace?.approved_by ? [["Asked by", <bdi key="by">{record.requester}</bdi>] as [string, ReactNode]] : []),
          ...(record.priority ? [["Priority", <bdi key="priority">{record.priority}</bdi>] as [string, ReactNode]] : []),
          ...(record.target_date ? [["Wanted by", formatDay(record.target_date)] as [string, ReactNode]] : []),
          ["Applied", record.applied_at ? formatDay(record.applied_at) : <span className="cat-quiet">Not recorded</span>],
          ...(record.product_id
            ? [["To", <Link key="to" to={`${base}/offerings/${encodeURIComponent(record.product_id)}`}><bdi>{offering?.name ?? record.product_id}</bdi></Link>] as [string, ReactNode]]
            : []),
        ]}
      />
      <Section title="What it changed" count={record.items.length} headingLevel={3}>
        {record.items.length ? (
          <Lines>
            {record.items.map((item, index) => {
              const status = ITEM_STATUS[item.status ?? "recorded"];
              const due = item.status === "gap" || item.status === "conflict";
              return (
                <li key={`${item.kind}:${item.feature_id ?? index}`}>
                  {item.feature_id && <span className="offering-id">{item.feature_id}</span>} <span dir="auto">{item.summary}</span>
                  {status && (due ? <> <Status tone="attention">{status}</Status></> : <span className="cat-quiet"> ({status})</span>)}
                </li>
              );
            })}
          </Lines>
        ) : (
          <p className="cat-quiet">Nothing is recorded.</p>
        )}
      </Section>
      {record.gaps.length > 0 && (
        <Section title="Not mapped" count={record.gaps.length} headingLevel={3}>
          <Lines>
            {record.gaps.map((text) => <li key={text}><Status tone="attention"><span dir="auto">{text}</span></Status></li>)}
          </Lines>
        </Section>
      )}
    </RecordView>
  );
}
