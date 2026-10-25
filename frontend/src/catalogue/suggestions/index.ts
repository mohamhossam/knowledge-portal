/**
 * Reading a draft's suggestions: which system each would change, what it says
 * in words, and whether it is ready, needs a person, or waits for another.
 * Pure functions over the suggestions payload and the draft.
 */
export { ACCEPTED_FILES, typedFile } from "./files";
export { type Blocker, blockers, bulkAcceptable, dependencyEdges, inDependencyOrder, systemsFirst } from "./dependencies";
export { type SuggestionGroup, suggestionGroups } from "./groups";
export { type Lexicon, lexicon } from "./lexicon";
export { type Reading, documentWarnings, featureWarnings, jobReason, reading, warningInWords } from "./readings";
export { changeSentence, decideWhy, inWords, listed, offeringHolds, standaloneSentence } from "./sentences";
export {
  type Filter, STATE_LABEL, draftedForRequirement, fromCatalogue, matchesFind, needsOneByOne, shown, suggestionState, tally,
} from "./state";
export { realisedByKey } from "./keys";
export { waitsFor, waitsForMany } from "./waits";
