/**
 * The lab's words for what the model carries as kinds: lane names, the flow's
 * events and gateways, how a call is made, and a journey seen through a channel.
 * The model holds no English; the views and the exports name things from here.
 */
import type { Catalogue, Integration, IntegrationMode, JourneyView, Lane, Offering, Step, StepRole } from "../../catalogue/model/model";

export const NOT_STATED = "Not stated";

/** The catalogue's name: its version's name up to any colon ("SMB architecture: Business Pro Plus" is "SMB architecture"). */
export function catalogueName(data: Pick<Catalogue, "name">): string {
  return data.name.split(":")[0]!.trim() || data.name;
}

/** What a product's gaps are measured against: its primary source, else the version's first, by short name. */
export function gapSource(data: Pick<Catalogue, "sources">, offering: Pick<Offering, "primarySource">): string {
  const source = data.sources.find((item) => item.id === offering.primarySource) ?? data.sources[0];
  return source?.short || source?.title || "the sources";
}

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

/**
 * A role's name: the version's vocabulary label for it, else the code as written ("payment"
 * reads "Payment"). A role is never left unnamed. A map card has room for the same label.
 */
export function roleName(data: Pick<Catalogue, "roleTerms">, role: StepRole): string {
  const term = data.roleTerms[role];
  if (term) return term;
  const written = role.replace(/-/g, " ");
  return written.charAt(0).toUpperCase() + written.slice(1);
}
