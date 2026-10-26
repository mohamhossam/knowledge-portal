import { Fragment, type ReactNode, useState } from "react";

import { ActionGroup, Button, type ComboOption, Combobox } from "../../design/components";
import { count } from "../../home/format";
import type { Blocker } from "../suggestions";

/** A system of the draft, as the existing-system answer offers it. */
export type DraftSystem = { id: string; name: string; aliases: string[] };

/** A CFSS or RFSS of the draft: what a name read as an offering, or rules, may really be (ADR-0127). */
export type DraftSpecification = { id: string; name: string; aliases: string[]; layer: "cfs" | "rfs" };

/** What the draft already holds, for saying a missing name is one of them. */
export type DraftChoices = {
  systems: DraftSystem[];
  specifications: DraftSpecification[];
  channels: { id: string; name: string }[];
  offerings: { id: string; name: string; code?: string | null; order_types: { code: string; name: string }[] }[];
};

/** One answer to what a missing thing is; the page turns it into the service's settle request. */
export type Answer =
  | { kind: "system" }
  | { kind: "offering" }
  | { kind: "existing"; id: string; name: string }
  | { kind: "specification"; id: string; name: string; layer: DraftSpecification["layer"] }
  | { kind: "new_specification"; layer: DraftSpecification["layer"] }
  | { kind: "order_type" }
  | { kind: "existing_order_type"; id: string; name: string }
  | { kind: "channel" }
  | { kind: "existing_channel"; id: string; name: string }
  | { kind: "without_link" }
  | { kind: "component" }
  | { kind: "without_component" };

/** The answers the page settles itself, by deciding or editing; the rest go to the service. */
export type OwnAnswer = Extract<Answer, { kind: "without_link" | "component" | "without_component" }>;

/** The service's settle request for an answer. An order type is named apart from its offering. */
export function settleRequest(blocker: Blocker, chosen: Exclude<Answer, OwnAnswer>) {
  const { reference, name } = blocker;
  const orderType = name.split(" › ").slice(1).join(" › ");
  switch (chosen.kind) {
    case "existing":
      return { system_id: reference, name, kind: chosen.kind, existing_system_id: chosen.id };
    case "specification":
      return { system_id: reference, name, kind: chosen.kind, specification_id: chosen.id };
    case "new_specification":
      return { system_id: reference, name, kind: chosen.kind, layer: chosen.layer };
    case "order_type":
      return { system_id: reference, name: orderType, kind: chosen.kind };
    case "existing_order_type":
      return { system_id: reference, name: orderType, kind: chosen.kind, existing_id: chosen.id };
    case "existing_channel":
      return { system_id: reference, name, kind: chosen.kind, existing_id: chosen.id };
    default:
      return { system_id: reference, name, kind: chosen.kind };
  }
}

const SPEC_WORD: Record<DraftSpecification["layer"], string> = { cfs: "CFSS", rfs: "RFSS" };

const squeezed = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** What kind of thing is missing, read from the blocker's key ("ordertype:…", "channel:…"). */
type Topic = "system" | "offering" | "ordertype" | "channel" | "specification" | "realisation" | "component" | "other";

function topicOf(blocker: Blocker): Topic {
  if (blocker.kind !== "other") return blocker.kind;
  const prefix = blocker.key.split(":")[0];
  return prefix === "ordertype" || prefix === "channel" || prefix === "specification" || prefix === "realisation" || prefix === "component"
    ? prefix
    : "other";
}

/** The system a missing component belongs to, by name: what waits on it says. */
export function componentSystem(blocker: Blocker): string {
  return blocker.waiting[0]?.system_name ?? blocker.label.split(" of ").slice(-1)[0] ?? blocker.reference.split("/")[0]!;
}

const TOPIC_WORD: Record<Topic, string> = {
  system: "System",
  offering: "Offering",
  ordertype: "Order type",
  channel: "Channel",
  specification: "CFSS or RFSS",
  realisation: "Realised by",
  component: "Component",
  other: "Other",
};

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

/** The draft's CFSS or RFSS of a name, by id, name or other name. */
function specificationNamed(name: string, specifications: DraftSpecification[]): DraftSpecification | undefined {
  const wanted = squeezed(name);
  return specifications.find((item) => [item.id, item.name, ...item.aliases].some((label) => squeezed(label) === wanted));
}

/** The offering an order type is missing from, by any of its names. */
function offeringOf(blocker: Blocker, offerings: DraftChoices["offerings"]) {
  const wanted = squeezed(blocker.reference);
  return offerings.find((item) => [item.id, item.name, item.code ?? ""].some((label) => label && squeezed(label) === wanted));
}

/** Why it is missing, in plain words, under its name. `held` is the draft's specification of that name, if any. */
function reason(
  blocker: Blocker,
  topic: Topic,
  specification: DraftSpecification | undefined,
  offering: string | undefined,
  held: DraftSpecification | undefined,
): string {
  switch (topic) {
    case "system":
      return "Named as a system; no document describes it and the draft doesn't have it.";
    case "offering":
      return specification
        ? `Read as an offering, but it is the ${SPEC_WORD[specification.layer]} ${specification.name} in your draft.`
        : "Named as an offering; no document describes it and the draft doesn't have it.";
    case "ordertype":
      return `Its journey is for an order type ${offering ?? "the offering"} doesn't list.`;
    case "channel":
      return "Named as a sales channel the draft doesn't have.";
    case "specification":
      return "Rules are said of it, but no CFSS or RFSS by this name is in the draft.";
    case "realisation":
      return held
        ? `Named as what realises a record a layer below it, but it is the ${SPEC_WORD[held.layer]} ${held.name} in your draft: it can't realise what sits beside or above it.`
        : `Named as what realises a record, but nothing one layer below has this name (it should be ${blocker.label.split(" as ").slice(1).join(" as ") || "a lower layer"}).`;
    case "component":
      return `Named as a component of ${componentSystem(blocker)}; ${componentSystem(blocker)} has no component by this name, and no suggestion adds one.`;
    default:
      return `${blocker.label}: nothing in the draft or the suggestions adds it.`;
  }
}

/** A choice among what the draft already has, opened under a row. */
type Picking = {
  key: string;
  label: string;
  hint: string;
  options: ComboOption[];
  suggested?: { id: string; reason: string };
  confirm: (option: ComboOption) => string;
  answer: (option: ComboOption) => Answer;
};

/**
 * Every dead end in one table (Decide): what suggestions wait for that neither the draft nor any
 * suggestion adds. Each says why in plain words and offers its own answers: a system, an order
 * type, a channel or a specification is suggested, added, or said to be one the draft has; a
 * link upside down is dropped. Rejecting what waits is the last resort, and leaving it is fine:
 * publishing leaves it out.
 */
export function MissingThings({ blockers, choices, busy, settling, onAnswer, onShow, onReject }: {
  blockers: Blocker[];
  choices: DraftChoices;
  busy: boolean;
  settling: boolean;
  onAnswer: (blocker: Blocker, answer: Answer) => void;
  onShow: (blocker: Blocker) => void;
  onReject: (blocker: Blocker) => void;
}) {
  const [picking, setPicking] = useState<Picking | null>(null);
  const [chosen, setChosen] = useState<ComboOption | null>(null);
  const pick = (next: Picking) => {
    setPicking((current) => (current?.key === next.key ? null : next));
    setChosen(null);
  };
  const answer = (blocker: Blocker, value: Answer) => onAnswer(blocker, value);

  return (
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
            const topic = topicOf(blocker);
            const specification = specificationFor(blocker, choices.specifications);
            const offering = topic === "ordertype" ? offeringOf(blocker, choices.offerings) : undefined;
            const orderType = topic === "ordertype" ? blocker.name.split(" › ").slice(1).join(" › ") : "";
            const reject = (
              <Button busy={busy} onClick={() => onReject(blocker)} aria-label={`Reject what waits on ${blocker.name}…`}>Reject…</Button>
            );
            let actions: ReactNode;
            if (topic === "system") {
              const likely = likelySystem(blocker.name, choices.systems);
              actions = (
                <>
                  <Button
                    aria-expanded={picking?.key === blocker.key}
                    onClick={() => pick({
                      key: blocker.key,
                      label: `Which system of the draft is ${blocker.name}?`,
                      hint: `${blocker.name} becomes another name for it, so the ${count(blocker.waiting.length, "suggestion")} waiting on it can be decided.`,
                      options: choices.systems.map((item) => ({ id: item.id, label: item.name, hint: item.aliases.join(", ") || undefined })),
                      suggested: likely ? { id: likely.id, reason: `Its name is close to ‘${blocker.name}’` } : undefined,
                      confirm: (option) => `Make ${blocker.name} a name for ${option.label}`,
                      answer: (option) => ({ kind: "existing", id: option.id, name: option.label }),
                    })}
                  >
                    A system the draft has…
                  </Button>
                  <Button busy={settling} onClick={() => answer(blocker, { kind: "system" })}>A new system</Button>
                  <Button busy={settling} onClick={() => answer(blocker, { kind: "offering" })}>An offering</Button>
                  {reject}
                </>
              );
            } else if (topic === "offering") {
              actions = specification ? (
                <>
                  <Button
                    busy={settling}
                    onClick={() => answer(blocker, { kind: "specification", id: specification.id, name: specification.name, layer: specification.layer })}
                    aria-label={`It is the ${SPEC_WORD[specification.layer]} ${specification.name} in the draft: move its rules there`}
                  >
                    It is the {SPEC_WORD[specification.layer]} in the draft
                  </Button>
                  {reject}
                </>
              ) : (
                <>
                  <Button busy={settling} onClick={() => answer(blocker, { kind: "offering" })}>Suggest the offering</Button>
                  {reject}
                </>
              );
            } else if (topic === "ordertype" && offering) {
              actions = (
                <>
                  <Button busy={settling} onClick={() => answer(blocker, { kind: "order_type" })}>Add it to {offering.name}</Button>
                  <Button
                    aria-expanded={picking?.key === blocker.key}
                    onClick={() => pick({
                      key: blocker.key,
                      label: `Which order type of ${offering.name} is ${orderType}?`,
                      hint: `The ${count(blocker.waiting.length, "journey")} for ${orderType} become journeys for it.`,
                      options: offering.order_types.map((item) => ({ id: item.code, label: item.name, hint: item.code })),
                      confirm: (option) => `Use ${option.label}`,
                      answer: (option) => ({ kind: "existing_order_type", id: option.id, name: option.label }),
                    })}
                  >
                    One {offering.name} has…
                  </Button>
                  {reject}
                </>
              );
            } else if (topic === "channel") {
              actions = (
                <>
                  <Button busy={settling} onClick={() => answer(blocker, { kind: "channel" })}>Suggest the channel</Button>
                  <Button
                    aria-expanded={picking?.key === blocker.key}
                    unavailableReason={choices.channels.length ? null : "The draft has no channel yet."}
                    onClick={() => pick({
                      key: blocker.key,
                      label: `Which channel of the draft is ${blocker.name}?`,
                      hint: `What waits on it names that channel instead.`,
                      options: choices.channels.map((item) => ({ id: item.id, label: item.name })),
                      confirm: (option) => `Use ${option.label}`,
                      answer: (option) => ({ kind: "existing_channel", id: option.id, name: option.label }),
                    })}
                  >
                    A channel the draft has…
                  </Button>
                  {reject}
                </>
              );
            } else if (topic === "specification") {
              actions = (
                <>
                  <Button busy={settling} onClick={() => answer(blocker, { kind: "new_specification", layer: "cfs" })}>Suggest as a CFSS</Button>
                  <Button busy={settling} onClick={() => answer(blocker, { kind: "new_specification", layer: "rfs" })}>Suggest as an RFSS</Button>
                  <Button
                    aria-expanded={picking?.key === blocker.key}
                    onClick={() => pick({
                      key: blocker.key,
                      label: `Which CFSS or RFSS of the draft is ${blocker.name}?`,
                      hint: `Its ${count(blocker.waiting.length, "rule")} become that specification's rules.`,
                      options: choices.specifications.map((item) => ({ id: item.id, label: item.name, hint: SPEC_WORD[item.layer] })),
                      confirm: (option) => `Move the rules to ${option.label}`,
                      answer: (option) => {
                        const found = choices.specifications.find((item) => item.id === option.id)!;
                        return { kind: "specification", id: found.id, name: found.name, layer: found.layer };
                      },
                    })}
                  >
                    One the draft has…
                  </Button>
                  {reject}
                </>
              );
            } else if (topic === "component") {
              const system = componentSystem(blocker);
              actions = (
                <>
                  <Button busy={settling} onClick={() => answer(blocker, { kind: "component" })}>Add it to {system}</Button>
                  <Button
                    busy={settling}
                    onClick={() => answer(blocker, { kind: "without_component" })}
                    aria-label={`Accept what waits on ${blocker.name} on ${system} itself, without the component`}
                  >
                    Accept without it
                  </Button>
                  {reject}
                </>
              );
            } else if (topic === "realisation") {
              actions = (
                <>
                  <Button busy={settling} onClick={() => answer(blocker, { kind: "without_link" })}>Accept without that link</Button>
                  {reject}
                </>
              );
            } else {
              actions = reject;
            }
            return (
              <Fragment key={blocker.key}>
                <tr>
                  <th scope="row">
                    <Button variant="link" onClick={() => onShow(blocker)} aria-label={`Show what waits on ${blocker.name}`}><bdi>{blocker.name}</bdi></Button>
                    <span className="draft-detail">
                      {reason(blocker, topic, specification, offering?.name, topic === "realisation" ? specificationNamed(blocker.name, choices.specifications) : undefined)}
                    </span>
                  </th>
                  <td>{specification ? SPEC_WORD[specification.layer] : TOPIC_WORD[topic]}</td>
                  <td className="ds-num">{blocker.waiting.length}</td>
                  <td><ActionGroup label={`Settle ${blocker.name}`}>{actions}</ActionGroup></td>
                </tr>
                {picking?.key === blocker.key && (
                  <tr className="draft-existing">
                    <td colSpan={4}>
                      <div className="draft-existing__body">
                        <Combobox
                          label={picking.label}
                          hint={picking.hint}
                          options={picking.options}
                          placeholder="Type to find it"
                          suggested={picking.suggested}
                          onSelect={setChosen}
                        />
                        <ActionGroup label={`Name ${blocker.name}`}>
                          <Button
                            variant="primary"
                            busy={settling}
                            unavailableReason={chosen ? null : "Choose one first."}
                            onClick={() => {
                              if (!chosen) return;
                              answer(blocker, picking.answer(chosen));
                              setPicking(null);
                            }}
                          >
                            {chosen ? picking.confirm(chosen) : "Use it"}
                          </Button>
                          <Button onClick={() => setPicking(null)}>Cancel</Button>
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
  );
}
