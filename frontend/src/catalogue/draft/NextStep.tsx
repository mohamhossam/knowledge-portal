import { Fragment, type ReactNode, useState } from "react";

import { ActionGroup, Button, type ComboOption, Combobox } from "../../design/components";
import { count } from "../../home/format";
import { ButtonLink } from "../../shell/links";
import type { Blocker } from "../suggestions";

const KIND_WORD: Record<Blocker["kind"], string> = { system: "System", offering: "Offering", other: "Other" };

/** A system of the draft, as the existing-system answer offers it. */
export type DraftSystem = { id: string; name: string; aliases: string[] };

/** A CFSS or RFSS of the draft: what a name read as an offering may really be (ADR-0127). */
export type DraftSpecification = { id: string; name: string; aliases: string[]; layer: "cfs" | "rfs" };

const SPEC_WORD: Record<DraftSpecification["layer"], string> = { cfs: "CFSS", rfs: "RFSS" };

const squeezed = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** The draft's CFSS or RFSS an offering nothing adds is named for, as the service finds a record by name. */
export function specificationFor(blocker: Blocker, specifications: DraftSpecification[]): DraftSpecification | undefined {
  if (blocker.kind !== "offering") return undefined;
  const wanted = new Set([blocker.reference, blocker.name].map(squeezed).filter(Boolean));
  return specifications.find((item) => [item.id, item.name, ...item.aliases].some((label) => wanted.has(squeezed(label))));
}

/** The draft's system most likely meant by a name nothing adds: one whose name or alias holds it, or the other way round. */
export function likelySystem(name: string, systems: DraftSystem[]): DraftSystem | undefined {
  const wanted = name.trim().toLocaleLowerCase();
  if (wanted.length < 3) return undefined;
  return systems.find((system) =>
    [system.name, ...system.aliases].some((label) => {
      const known = label.toLocaleLowerCase();
      return known.length >= 3 && (known.includes(wanted) || wanted.includes(known));
    }));
}

/**
 * The decide desk's first word: the one thing to do next, always. Questions only a
 * person can answer come first, then accepting the ready ones. When all that is left
 * waits on things no document describes (the dead ends, common in a first version),
 * the way on is said plainly: publishing leaves them out. The dead ends themselves are
 * one list, opened on request, where each is settled on the spot: a name suggestions
 * wait for is said to be a system the draft has (it becomes that system's alias), is
 * suggested as a new system or said to be a product offering, or what waits is rejected.
 */
export function NextStep({
  questions, bulk, bulkLabel, waiting, accepted, blockers, systems, specifications, focusTo, changesTo, busy, settling, onAcceptReady, onSettle, onSettleExisting,
  onSettleSpecification, onShow, onReject,
}: {
  questions: number;
  bulk: number;
  bulkLabel: string;
  waiting: number;
  accepted: number;
  blockers: Blocker[];
  /** The draft's systems, for saying a name is one of them. */
  systems: DraftSystem[];
  /** The draft's CFSSs and RFSSs, for saying a name read as an offering is one of them. */
  specifications: DraftSpecification[];
  focusTo: string;
  changesTo: string;
  busy: boolean;
  settling: boolean;
  onAcceptReady: () => void;
  onSettle: (blocker: Blocker, kind: "system" | "offering") => void;
  onSettleExisting: (blocker: Blocker, system: DraftSystem) => void;
  onSettleSpecification: (blocker: Blocker, specification: DraftSpecification) => void;
  onShow: (blocker: Blocker) => void;
  onReject: (blocker: Blocker) => void;
}) {
  const [open, setOpen] = useState(false);
  // The missing system being named as one the draft has, and the one chosen for it.
  const [naming, setNaming] = useState<string | null>(null);
  const [chosen, setChosen] = useState<DraftSystem | null>(null);
  const options: ComboOption[] = systems.map((system) => ({ id: system.id, label: system.name, hint: system.aliases.join(", ") || undefined }));
  const startNaming = (blocker: Blocker) => {
    setNaming(blocker.key);
    setChosen(null);
  };
  const stuck = new Set(blockers.flatMap((blocker) => blocker.waiting.map((item) => item.id))).size;
  const things = count(blockers.length, "thing");
  const toggle = blockers.length > 0 && (
    <Button aria-expanded={open} aria-controls="draft-missing" onClick={() => setOpen((shown) => !shown)}>
      {open ? "Hide the missing things" : `See the ${count(blockers.length, "missing thing")}`}
    </Button>
  );
  const accept = (variant: "primary" | "secondary") => (
    <Button variant={variant} busy={busy} onClick={onAcceptReady}>{bulkLabel}</Button>
  );
  let lead: ReactNode;
  let detail: ReactNode = null;
  let action: ReactNode = null;
  if (questions > 0) {
    lead = <>Answer the {count(questions, "question")} only you can decide{bulk > 0 && ", then accept the ready ones"}.</>;
    action = (
      <>
        <ButtonLink to={focusTo} variant="primary">Answer the {count(questions, "question")}</ButtonLink>
        {bulk > 0 && accept("secondary")}
      </>
    );
  } else if (bulk > 0) {
    lead = <>{bulkLabel}: none of them needs a decision.</>;
    action = accept("primary");
  } else if (blockers.length > 0) {
    lead = (
      <>
        {accepted > 0 && <>{accepted.toLocaleString("en")} accepted. </>}
        {stuck === waiting ? `The ${count(waiting, "suggestion")} left` : count(stuck, "suggestion")} {stuck === 1 ? "waits" : "wait"} on {things} no document describes.
      </>
    );
    detail = <>Settle them now, or go on: publishing leaves them out of this version, and a later version can add them.</>;
    action = <ButtonLink to={changesTo} variant="primary">Go on to the changes</ButtonLink>;
  } else if (waiting > 0) {
    lead = <>Open a waiting suggestion and edit it to name what the draft has, or reject it.</>;
  } else {
    lead = <>Every suggestion is decided. Next, read what the draft changes.</>;
    action = <ButtonLink to={changesTo} variant="primary">See the changes</ButtonLink>;
  }
  return (
    <section className="draft-next-step" aria-labelledby="draft-next-step-title">
      <h2 id="draft-next-step-title" className="draft-next-step__title">What to do next</h2>
      <p className="draft-next-step__lead">{lead}</p>
      {detail && <p className="draft-next-step__detail">{detail}</p>}
      {(action || toggle) && <ActionGroup label="Next step">{action}{toggle}</ActionGroup>}
      {open && (
        <div className="ds-table-wrap draft-missing" id="draft-missing">
          <table className="ds-table">
            <caption>Missing from the catalogue: what suggestions wait for that neither the draft nor any suggestion adds</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Kind</th>
                <th scope="col" className="ds-num">Waiting on it</th>
                <th scope="col">Settle it</th>
              </tr>
            </thead>
            <tbody>
              {blockers.map((blocker) => {
                const likely = blocker.kind === "system" ? likelySystem(blocker.name, systems) : undefined;
                const specification = specificationFor(blocker, specifications);
                return (
                  <Fragment key={blocker.key}>
                    <tr>
                      <th scope="row">
                        <Button variant="link" onClick={() => onShow(blocker)} aria-label={`Show what waits on ${blocker.name}`}><bdi>{blocker.name}</bdi></Button>
                        {blocker.kind === "other" && <span className="draft-detail">{blocker.label}</span>}
                      </th>
                      <td>{specification ? <>{SPEC_WORD[specification.layer]}<span className="draft-detail">Read as an offering</span></> : KIND_WORD[blocker.kind]}</td>
                      <td className="ds-num">{blocker.waiting.length}</td>
                      <td>
                        <ActionGroup label={`Settle ${blocker.name}`}>
                          {blocker.kind === "system" && (
                            <>
                              <Button
                                aria-expanded={naming === blocker.key}
                                aria-controls={`draft-existing-${blocker.key}`}
                                onClick={() => (naming === blocker.key ? setNaming(null) : startNaming(blocker))}
                              >
                                A system the draft has…
                              </Button>
                              <Button busy={settling} onClick={() => onSettle(blocker, "system")}>A new system</Button>
                              <Button busy={settling} onClick={() => onSettle(blocker, "offering")}>An offering</Button>
                            </>
                          )}
                          {specification ? (
                            <Button
                              busy={settling}
                              onClick={() => onSettleSpecification(blocker, specification)}
                              aria-label={`It is the ${SPEC_WORD[specification.layer]} ${specification.name} in the draft: move its rules there`}
                            >
                              It is the {SPEC_WORD[specification.layer]} in the draft
                            </Button>
                          ) : blocker.kind === "offering" && (
                            <Button busy={settling} onClick={() => onSettle(blocker, "offering")}>Suggest the offering</Button>
                          )}
                          <Button busy={busy} onClick={() => onReject(blocker)} aria-label={`Reject what waits on ${blocker.name}…`}>Reject…</Button>
                        </ActionGroup>
                      </td>
                    </tr>
                    {naming === blocker.key && (
                      <tr className="draft-existing" id={`draft-existing-${blocker.key}`}>
                        <td colSpan={4}>
                          <div className="draft-existing__body">
                          <Combobox
                            label={<>Which system of the draft is <bdi>{blocker.name}</bdi>?</>}
                            hint={<><bdi>{blocker.name}</bdi> becomes another name for it, so the {count(blocker.waiting.length, "suggestion")} waiting on it can be decided.</>}
                            options={options}
                            placeholder="A system's name or alias"
                            suggested={likely ? { id: likely.id, reason: `Its name is close to ‘${blocker.name}’` } : undefined}
                            onSelect={(option) => setChosen(systems.find((system) => system.id === option.id) ?? null)}
                          />
                          <ActionGroup label={`Name ${blocker.name}`}>
                            <Button
                              variant="primary"
                              busy={settling}
                              unavailableReason={chosen ? null : "Choose the system first."}
                              onClick={() => {
                                if (!chosen) return;
                                onSettleExisting(blocker, chosen);
                                setNaming(null);
                              }}
                            >
                              {chosen ? <>Make <bdi>{blocker.name}</bdi> a name for <bdi>{chosen.name}</bdi></> : "Use the system"}
                            </Button>
                            <Button onClick={() => setNaming(null)}>Cancel</Button>
                          </ActionGroup>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
