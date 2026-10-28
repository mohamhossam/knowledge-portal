/**
 * Governance: where the catalogue's knowledge comes from, and where its sources
 * disagree. Three registers of the version in service, one at a time in a
 * table: the conflicts between sources (each needs a decision), the sources by
 * level, and the change requests applied. The chosen record is read in the
 * inspector beside it; the register, the record and the search live in the URL.
 * Read only: a draft's sources and conflicts are edited in the portal's
 * catalogue, from Versions.
 */
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ITEM_STATUS, LEVEL } from "../../catalogue/governance";
import type { Catalogue, ChangeRequest, Conflict, Source } from "../../catalogue/model/model";
import { Status } from "../../design/components";
import { formatDay } from "../../home/format";
import { AreaTabs } from "./labChrome";
import { LAB, useLabData } from "./labData";
import { plural, useTitle } from "./labUtil";

type Register = "conflicts" | "sources" | "changes";

const REGISTERS: { id: Register; label: string }[] = [
  { id: "conflicts", label: "Conflicts" },
  { id: "sources", label: "Sources" },
  { id: "changes", label: "Change requests" },
];

const fold = (text: string) => text.normalize("NFKC").toLocaleLowerCase();

/** A level's word, for a level the register knows; anything else as written. */
const levelWord = (level: string) => (level in LEVEL ? LEVEL[level as keyof typeof LEVEL].word : level);

/** The sources in the register's order: canonical first, then primary, then carried forward. */
const byLevel = (sources: Source[]) => [...sources].sort((a, b) => a.level.localeCompare(b.level) || a.title.localeCompare(b.title));

export function GovernancePage() {
  const data = useLabData();
  useTitle("Governance");
  const [params, setParams] = useSearchParams();
  const register: Register = REGISTERS.find((item) => item.id === params.get("show"))?.id ?? "conflicts";
  const itemId = params.get("item");
  const find = params.get("find") ?? "";

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };
  const hrefOf = (show: Register, id?: string) => {
    const next = new URLSearchParams({ ...(show === "conflicts" ? {} : { show }), ...(id ? { item: id } : {}) });
    return `${LAB}/governance${next.size ? `?${next}` : ""}`;
  };

  const undecided = data.conflicts.filter((item) => !item.decision).length;
  const unsupplied = data.sources.filter((item) => !item.supplied).length;
  const levels = ["L1", "L2", "L3"].map((level) => ({ level, n: data.sources.filter((item) => item.level === level).length })).filter((item) => item.n);

  return (
    <>
      <AreaTabs current="governance" />
      <header className="lx-head lx-band">
        <div className="lx-band-row">
          <span className="lx-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="18" height="18">
              <path d="M8 1.5 13.5 3.5v4c0 3.2-2.3 5.6-5.5 7-3.2-1.4-5.5-3.8-5.5-7v-4z" />
              <path d="m5.5 8 1.8 1.8L10.8 6.3" />
            </svg>
          </span>
          <div className="lx-title">
            <h1>Governance</h1>
            <p className="lx-lede">Where this catalogue&rsquo;s knowledge comes from, and where its sources disagree</p>
          </div>
          <div className="lx-tools">
            <div className="cl-seg" role="group" aria-label="Register">
              {REGISTERS.map((item) => (
                <button key={item.id} type="button" aria-pressed={register === item.id} onClick={() => update({ show: item.id === "conflicts" ? null : item.id, item: null })}>
                  {item.label}
                </button>
              ))}
            </div>
            <label className="lx-find">
              <span className="ds-visually-hidden">Find in the {REGISTERS.find((item) => item.id === register)?.label.toLocaleLowerCase()}</span>
              <input className="cl-field" type="search" placeholder="Id, title or what it says" value={find} onChange={(event) => update({ find: event.target.value })} />
            </label>
          </div>
        </div>
        <div className="sy-row">
          <dl className="sy-figures">
            <div>
              <dt>Conflicts</dt>
              <dd>
                {data.conflicts.length}{" "}
                {undecided > 0 && <small>{undecided === data.conflicts.length ? "none decided yet" : `${undecided} still to decide`}</small>}
              </dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>
                {data.sources.length} {levels.length > 0 && <small>{levels.map((item) => `${item.n} ${levelWord(item.level).toLocaleLowerCase()}`).join(" · ")}</small>}
                {unsupplied > 0 && <small> · {unsupplied} not supplied</small>}
              </dd>
            </div>
            <div>
              <dt>Change requests applied</dt>
              <dd>{data.changes.length}</dd>
            </div>
          </dl>
          <p className="sy-source">The catalogue never picks a side of a conflict; each needs a decision. Drafts are edited from Versions.</p>
        </div>
      </header>

      <div className="cl-board gv-board">
        <div className="cl-board-main">
          {register === "conflicts" ? (
            <ConflictTable data={data} find={find} chosen={itemId} hrefOf={(id) => hrefOf("conflicts", id)} />
          ) : register === "sources" ? (
            <SourceTable data={data} find={find} chosen={itemId} hrefOf={(id) => hrefOf("sources", id)} />
          ) : (
            <ChangeTable data={data} find={find} chosen={itemId} hrefOf={(id) => hrefOf("changes", id)} />
          )}
        </div>
        <Inspector data={data} register={register} itemId={itemId} hrefOf={hrefOf} onClose={() => update({ item: null })} />
      </div>
    </>
  );
}

/** Rows that match the search, by any of their texts. */
function matching<T>(items: T[], find: string, texts: (item: T) => (string | undefined)[]): T[] {
  const wanted = fold(find.trim());
  return wanted ? items.filter((item) => texts(item).some((text) => text && fold(text).includes(wanted))) : items;
}

/** A register's table, or why it is empty. */
function Register({ label, total, shown, find, head, children }: { label: string; total: number; shown: number; find: string; head: ReactNode; children: ReactNode }) {
  if (!shown) {
    return (
      <div className="cl-empty">
        <p>{total ? `Nothing here is known by “${find.trim()}”.` : `This version records no ${label.toLocaleLowerCase()}.`}</p>
      </div>
    );
  }
  return (
    <div className="cl-tablewrap">
      <table className="cl-table gv-table">
        <caption className="ds-visually-hidden">
          {label}: {total === shown ? plural(total, "record") : `${shown} of ${total}`}
        </caption>
        <thead>{head}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function offeringName(data: Catalogue, id: string) {
  return data.offerings.find((item) => item.id === id)?.name ?? id;
}

function ConflictTable({ data, find, chosen, hrefOf }: { data: Catalogue; find: string; chosen: string | null; hrefOf: (id: string) => string }) {
  const rows = matching(data.conflicts, find, (item) => [item.id, item.title, item.difference]);
  return (
    <Register
      label="Conflicts between sources"
      total={data.conflicts.length}
      shown={rows.length}
      find={find}
      head={
        <tr>
          <th scope="col">Id</th>
          <th scope="col">Conflict</th>
          <th scope="col">Affects</th>
          <th scope="col">Decision</th>
        </tr>
      }
    >
      {rows.map((item) => (
        <tr key={item.id} aria-current={item.id === chosen ? "true" : undefined}>
          <td className="gv-id">{item.id}</td>
          <td>
            <Link to={hrefOf(item.id)} dir="auto">{item.title}</Link>
          </td>
          <td>{item.scope.length ? item.scope.map((scope) => offeringName(data, scope.offeringId)).join(", ") : <span className="gap">No product yet</span>}</td>
          <td>{item.decision ? "Stated" : <Status tone="attention">Not stated</Status>}</td>
        </tr>
      ))}
    </Register>
  );
}

function SourceTable({ data, find, chosen, hrefOf }: { data: Catalogue; find: string; chosen: string | null; hrefOf: (id: string) => string }) {
  const rows = matching(byLevel(data.sources), find, (item) => [item.id, item.title, item.short, item.owner]);
  return (
    <Register
      label="Sources"
      total={data.sources.length}
      shown={rows.length}
      find={find}
      head={
        <tr>
          <th scope="col">Level</th>
          <th scope="col">Source</th>
          <th scope="col">Cited as</th>
          <th scope="col">Version</th>
        </tr>
      }
    >
      {rows.map((item) => (
        <tr key={item.id} aria-current={item.id === chosen ? "true" : undefined}>
          <td className="gv-id">
            {item.level} <small>{levelWord(item.level)}</small>
          </td>
          <td>
            <Link to={hrefOf(item.id)} dir="auto">{item.title}</Link>
            {!item.supplied && <> <Status tone="attention">Not supplied</Status></>}
          </td>
          <td><bdi>{item.short}</bdi></td>
          <td>{item.version ? <bdi>{item.version}</bdi> : <span className="gap">Not stated</span>}</td>
        </tr>
      ))}
    </Register>
  );
}

function ChangeTable({ data, find, chosen, hrefOf }: { data: Catalogue; find: string; chosen: string | null; hrefOf: (id: string) => string }) {
  const rows = matching(data.changes, find, (item) => [item.id, item.title, item.reason]);
  return (
    <Register
      label="Change requests applied"
      total={data.changes.length}
      shown={rows.length}
      find={find}
      head={
        <tr>
          <th scope="col">Id</th>
          <th scope="col">Change request</th>
          <th scope="col">To</th>
          <th scope="col">Applied</th>
        </tr>
      }
    >
      {rows.map((item) => (
        <tr key={item.id} aria-current={item.id === chosen ? "true" : undefined}>
          <td className="gv-id">{item.id}</td>
          <td>
            <Link to={hrefOf(item.id)} dir="auto">{item.title}</Link>
          </td>
          <td>{item.offeringId ? offeringName(data, item.offeringId) : <span className="gap">The catalogue</span>}</td>
          <td>{item.appliedAt ? formatDay(item.appliedAt) : <span className="gap">Not recorded</span>}</td>
        </tr>
      ))}
    </Register>
  );
}

/** The chosen record beside the table; with none chosen, what the levels mean. */
function Inspector({ data, register, itemId, hrefOf, onClose }: { data: Catalogue; register: Register; itemId: string | null; hrefOf: (show: Register, id?: string) => string; onClose: () => void }) {
  const conflict = register === "conflicts" ? data.conflicts.find((item) => item.id === itemId) : undefined;
  const source = register === "sources" ? data.sources.find((item) => item.id === itemId) : undefined;
  const change = register === "changes" ? data.changes.find((item) => item.id === itemId) : undefined;
  const title = conflict?.title ?? source?.title ?? change?.title;

  if (!title) {
    return (
      <aside className="cl-insp" aria-label="About the registers">
        {itemId && <p className="cl-note">This version has nothing called &ldquo;{itemId}&rdquo; here.</p>}
        <p className="cl-body">Choose a record to read it here.</p>
        <h3>Source levels</h3>
        <dl className="gv-levels">
          {Object.entries(LEVEL).map(([level, words]) => (
            <div key={level}>
              <dt>{level} {words.word}</dt>
              <dd>{words.long}.</dd>
            </div>
          ))}
        </dl>
        <h3>Change requests</h3>
        <p className="cl-body">Applied by accepting them in a draft, never edited by hand.</p>
      </aside>
    );
  }

  return (
    <aside
      className="cl-insp"
      aria-labelledby="gv-insp-h"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="cl-insp-head">
        <h2 id="gv-insp-h" dir="auto">{title}</h2>
        <button type="button" className="cl-close" onClick={onClose} aria-label={`Close ${title}`}>
          Close
        </button>
      </div>
      {conflict && <ConflictDetail data={data} conflict={conflict} />}
      {source && <SourceDetail data={data} source={source} conflictHref={(id) => hrefOf("conflicts", id)} />}
      {change && <ChangeDetail data={data} change={change} />}
    </aside>
  );
}

function ConflictDetail({ data, conflict }: { data: Catalogue; conflict: Conflict }) {
  const said = (sourceId: string, reference?: string) => {
    const source = data.sources.find((item) => item.id === sourceId);
    return [source ? `${source.short} (${source.level})` : sourceId, reference].filter(Boolean).join(" ");
  };
  return (
    <>
      <p className="cl-sub">{conflict.id}</p>
      {conflict.difference && <p className="cl-body" dir="auto">{conflict.difference}</p>}
      <h3>What each source says</h3>
      <dl className="gv-sides">
        {conflict.sides.map((side, index) => (
          <div key={index}>
            <dt dir="auto">{said(side.sourceId, side.reference)}</dt>
            <dd dir="auto">{side.statement}</dd>
          </div>
        ))}
      </dl>
      <h3>Decision needed</h3>
      {conflict.decision ? <p className="cl-body" dir="auto">{conflict.decision}</p> : <p><Status tone="attention">Not stated</Status></p>}
      {conflict.impact && <p className="cl-note" dir="auto">Meanwhile: {conflict.impact}</p>}
      <h3>What it affects</h3>
      {conflict.scope.length ? (
        <ul className="gv-lines">
          {conflict.scope.map((scope) => {
            const offering = data.offerings.find((item) => item.id === scope.offeringId);
            const orders = scope.orderTypes.map((code) => offering?.orderTypes.find((type) => type.code === code)?.name ?? code);
            return (
              <li key={scope.offeringId}>
                {offering ? <Link to={`${LAB}/products/${encodeURIComponent(offering.id)}`}>{offering.name}</Link> : scope.offeringId}
                {orders.length ? `: ${orders.join(", ")}` : ", every order type"}
                {scope.questionId && <>, raises {scope.questionId}</>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="cl-body">It affects no product yet.</p>
      )}
    </>
  );
}

function SourceDetail({ data, source, conflictHref }: { data: Catalogue; source: Source; conflictHref: (id: string) => string }) {
  const offerings = data.offerings.filter((item) => item.primarySource === source.id);
  const conflicts = data.conflicts.filter((item) => item.sides.some((side) => side.sourceId === source.id));
  const facts: [string, ReactNode][] = [
    ["Level", `${source.level} ${levelWord(source.level)}`],
    ["Cited as", <bdi key="short">{source.short}</bdi>],
    ...(source.version ? [["Version", <bdi key="version">{source.version}</bdi>] as [string, ReactNode]] : []),
    ...(source.file ? [["File", <bdi key="file">{source.file}</bdi>] as [string, ReactNode]] : []),
    ["Covers", source.scope ? <bdi key="scope">{source.scope}</bdi> : <span className="gap">Not stated</span>],
    ["Cannot tell", source.boundary ? <bdi key="boundary">{source.boundary}</bdi> : <span className="gap">Not stated</span>],
  ];
  return (
    <>
      {!source.supplied && <p><Status tone="attention">Registered, but its file was never supplied</Status></p>}
      {source.owner && <p className="cl-body" dir="auto">The authority for: {source.owner}</p>}
      <dl className="gv-facts">
        {facts.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3>Named by</h3>
      {offerings.length || conflicts.length ? (
        <ul className="gv-lines">
          {offerings.map((offering) => (
            <li key={`o:${offering.id}`}>
              <Link to={`${LAB}/products/${encodeURIComponent(offering.id)}`}>{offering.name}</Link>, as its primary source
            </li>
          ))}
          {conflicts.map((conflict) => (
            <li key={`c:${conflict.id}`}>
              The conflict <Link to={conflictHref(conflict.id)} dir="auto">{conflict.title}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cl-body">No product or conflict names it.</p>
      )}
    </>
  );
}

function ChangeDetail({ data, change }: { data: Catalogue; change: ChangeRequest }) {
  const facts: [string, ReactNode][] = [
    ["From", change.origin === "explorer" ? "The original explorer" : "Requirement AI"],
    ...(change.requester ? [["Asked by", <bdi key="by">{change.requester}</bdi>] as [string, ReactNode]] : []),
    ...(change.priority ? [["Priority", <bdi key="priority">{change.priority}</bdi>] as [string, ReactNode]] : []),
    ...(change.targetDate ? [["Wanted by", formatDay(change.targetDate)] as [string, ReactNode]] : []),
    ["Applied", change.appliedAt ? formatDay(change.appliedAt) : <span className="gap">Not recorded</span>],
    ...(change.offeringId
      ? [["To", <Link key="to" to={`${LAB}/products/${encodeURIComponent(change.offeringId)}`}>{offeringName(data, change.offeringId)}</Link>] as [string, ReactNode]]
      : []),
  ];
  return (
    <>
      <p className="cl-sub">{change.id}</p>
      {change.reason && <p className="cl-body" dir="auto">Why: {change.reason}</p>}
      <dl className="gv-facts">
        {facts.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3>What it changed</h3>
      {change.items.length ? (
        <ul className="gv-lines">
          {change.items.map((item, index) => {
            const status = ITEM_STATUS[item.status];
            const due = item.status === "gap" || item.status === "conflict";
            return (
              <li key={`${item.featureId ?? ""}:${index}`}>
                {item.featureId && <span className="gv-id">{item.featureId} </span>}
                <span dir="auto">{item.summary}</span>
                {status && (due ? <> <Status tone="attention">{status}</Status></> : <span className="cl-sub"> ({status})</span>)}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="cl-body">Nothing is recorded.</p>
      )}
      {change.gaps.length > 0 && (
        <>
          <h3>Not mapped</h3>
          <ul className="gv-lines">
            {change.gaps.map((text) => (
              <li key={text}>
                <Status tone="attention"><span dir="auto">{text}</span></Status>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
