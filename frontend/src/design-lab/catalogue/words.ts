/**
 * The lab's words for what the model carries as kinds: lane names, the flow's
 * events and gateways, how a call is made, and a journey seen through a channel.
 * The model holds no English; the views and the exports name things from here.
 */
import type { Catalogue, Integration, IntegrationMode, JourneyView, Lane, Step, StepRole } from "../../architecture/model";

export const NOT_STATED = "Not stated";

/** A call whose source names no interface or interaction. */
export const HANDOVER = "Hand-over";

/** The lane of a step the source names no performer for. */
export const ORDERING_CHANNEL = "Ordering channel";

export const MODE_WORDS: Record<IntegrationMode, string> = {
  sync: "sync",
  async: "async",
  "not-stated": "not stated",
};

/** A system's name, or its id when the catalogue doesn't hold it. */
export function systemName(data: Catalogue, id: string): string {
  return data.systems.find((system) => system.id === id)?.name ?? id;
}

/** A lane's name: a system's, a team or party's, or the ordering channel. */
export function laneName(data: Catalogue, lane: Lane): string {
  switch (lane.kind) {
    case "system":
      return systemName(data, lane.systemId);
    case "team":
      return lane.name;
    case "channel":
      return ORDERING_CHANNEL;
  }
}

/** What a lane is, under its name, when it isn't a system with a TAM domain. */
export function laneKindName(lane: Lane): string {
  return lane.kind === "team" ? "Team or party" : "Channel";
}

/** A step's name: an activity's own, or a word for the event or gateway the flow implies. */
export function stepName(step: Step): string {
  switch (step.kind) {
    case "task":
      return step.name;
    case "exclusive":
      return step.question ?? "Decision";
    case "parallel":
      return step.gateway === "split" ? "In parallel" : "All tracks done";
    case "start":
      return "Start";
    case "end":
      return "End";
  }
}

/** The interface or interaction a call names, or a hand-over. */
export function operationName(call: Integration): string {
  return call.operation ?? HANDOVER;
}

/** How a call is made, as its source says. */
export function styleName(call: Integration): string {
  return call.style ?? NOT_STATED;
}

/** A journey's name with the channel it is seen through ("New activation · B2B web"). */
export function viewTitle(data: Catalogue, view: JourneyView): string {
  const channel = data.channels.find((item) => item.id === view.channel)?.name;
  return channel ? `${view.name} · ${channel}` : view.name;
}

/** Why a journey is seen through another channel than the one asked for (`channelMissing`). */
export function channelMissingText(journey: string, asked: string, shown: string): string {
  return `${journey} isn't offered through “${asked}”; it is shown through ${shown} instead.`;
}

/** The lab's words for the roles it knows: what a step does, and the shorter form a map card has room for. */
const ROLE_WORDS: Record<string, { long: string; short: string }> = {
  capture: { long: "Captures the order", short: "Captures" },
  catalog: { long: "Catalogue", short: "Catalogue" },
  "customer-data": { long: "Customer data", short: "Customer data" },
  orchestrate: { long: "Orchestrates", short: "Orchestrates" },
  validate: { long: "Validates", short: "Validates" },
  activate: { long: "Activates", short: "Activates" },
  field: { long: "Field work", short: "Field work" },
  logistics: { long: "Logistics", short: "Logistics" },
  track: { long: "Tracks", short: "Tracks" },
  notify: { long: "Notifies", short: "Notifies" },
  bill: { long: "Bills", short: "Bills" },
  record: { long: "Records", short: "Records" },
};

/**
 * A role's name: the lab's words for a role it knows; else the vocabulary's label for it;
 * else the code as written ("payment" reads "Payment"). A role is never left unnamed.
 */
export function roleName(data: Pick<Catalogue, "roleTerms">, role: StepRole, form: "long" | "short" = "long"): string {
  const known = ROLE_WORDS[role];
  if (known) return known[form];
  const term = data.roleTerms[role];
  if (term) return term;
  const written = role.replace(/-/g, " ");
  return written.charAt(0).toUpperCase() + written.slice(1);
}
