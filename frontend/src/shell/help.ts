/**
 * Help panel content per page (interaction model §14, WCAG 3.2.6). The keys
 * listed are the ones each page has today: an area that rebuilds a page
 * updates its entry in the same change. Wording follows docs/ux/content.
 */
type HelpEntry = { title: string; body: string[]; terms: [string, string][]; keys: [string, string][] };

export const PAGE_KEYS: [string, string][] = [
  ["?", "Open this help"],
  ["g w", "Go to To do"],
  ["g l", "Go to the library"],
  ["g c", "Go to the catalogue"],
  ["g o", "Go to Ownership"],
  ["g r", "Go to historic requirements"],
  ["g j", "Open Jobs"],
  ["/", "Find on this page, where the page has a find field"],
  ["Esc", "Close a panel and go back to what opened it"],
];

const NEUTRAL: HelpEntry = {
  title: "Knowledge portal",
  body: ["Curate the knowledge base: the library, the catalogue and who runs each system."],
  terms: [["In service", "What connected apps read or cite now."]],
  keys: [],
};

const PAGES: { match: (path: string) => boolean; entry: HelpEntry }[] = [
  {
    // Focus mode (UX rebuild, phase 2): a review or a draft's decisions, one question at a time.
    match: (path) => /\/focus\/?$/.test(path),
    entry: {
      title: "Focus mode",
      body: [
        "One question at a time. What needs you comes first; the rest is asked a group at a time. Nothing is sent until the summary at the end, which you confirm.",
        "Skip a question to come back to it. Leave keeps your answers here; the full page shows them too.",
      ],
      terms: [
        ["Accept group", "Takes a sheet's or slide's passages as they stand. Change any one on the full page."],
        ["What follows", "Suggestions that become ready once the ones you accept are in the draft."],
      ],
      keys: [
        ["1–9", "Choose an answer"],
        ["Enter", "Confirm and go to the next question"],
        ["Esc", "Leave focus mode"],
      ],
    },
  },
  {
    match: (path) => path === "/library/search",
    entry: {
      title: "Search passages",
      body: ["Search the passages of the documents in service, across all owners. A result opens its document at that passage."],
      terms: [["Passage", "One reviewed unit of a document's text that can be cited."]],
      keys: [],
    },
  },
  {
    // A document's main page: its review desk while a version waits, else its overview.
    match: (path) => /^\/library\/[^/]+$/.test(path),
    entry: {
      title: "A document and its review",
      body: [
        "While a version waits for review, move through its passages: keep, edit or exclude each, then save your review with a summary.",
        "Approve and publish makes the reviewed passages citable. Withdraw stops them being cited; Return to service publishes them again.",
      ],
      terms: [
        ["Passage", "One reviewed unit of a document's text that can be cited."],
        ["Seen", "A passage that stayed the current one for a moment in this review, in this browser tab. Passing through doesn't count."],
        ["Flagged", "Has a warning from reading."],
        ["Blocks approval", "A warning that must be resolved: exclude the passage, or upload a new version."],
        ["In service", "The published version connected apps cite now."],
      ],
      keys: [
        ["↑ ↓ or j k", "Previous or next passage (in the passage table)"],
        ["Home / End", "First or last passage"],
        ["n / Shift+n", "Next or previous flagged passage not seen yet, then the next not seen"],
        ["x / i", "Exclude (then give the reason; Enter goes back) / include"],
        ["e", "Edit the text (Esc goes back)"],
        ["o", "Show the original"],
        ["Space / Shift+↑ ↓", "Select passages, for Exclude or Include in bulk"],
        ["Ctrl+Enter", "Save the review, anywhere on the desk"],
      ],
    },
  },
  {
    match: (path) => /^\/library\/[^/]+\/versions$/.test(path),
    entry: {
      title: "A document's versions",
      body: ["The files uploaded, what was published from them, and the optional search index for tables."],
      terms: [
        ["Version", "One uploaded file of a document."],
        ["Search index for tables", "An optional second index that keeps table rows together."],
      ],
      keys: [],
    },
  },
  {
    match: (path) => /^\/library\/[^/]+\/ownership$/.test(path),
    entry: {
      title: "A document's ownership",
      body: [
        "Who owns the document, and handing it to another knowledge admin. The new owner gets its private versions and reviews; you keep what every admin sees.",
        "The admin record lists what admins did on the owner's behalf.",
      ],
      terms: [["Knowledge admin", "The role that may curate the library."]],
      keys: [],
    },
  },
  {
    match: (path) => path.startsWith("/library"),
    entry: {
      title: "Library",
      body: [
        "Reviewed reference documents that connected apps can cite. Filter by state or owner, find by title, or upload documents.",
        "Each upload is scanned and read; you review what was read and publish it before anything can cite it.",
      ],
      terms: [
        ["In service", "The published version connected apps cite now."],
        ["Needs attention", "Reading failed or stopped: the row says why, and the document offers the fix."],
        ["Withdraw", "Take a document out of service, so nothing cites it any more."],
      ],
      keys: [["/", "Find a document (with page-wide shortcuts on)"]],
    },
  },
  {
    match: (path) => path.startsWith("/architecture/versions/"),
    entry: {
      title: "Preparing a catalogue version",
      body: ["Read the sources, decide the suggestions, check the changes and their mapping impact, then publish."],
      terms: [
        ["Suggested", "Something a model proposed from a source that nobody has decided yet."],
        ["Stated / inferred", "Whether the source says it outright or the model inferred it."],
        ["Mapping impact", "How the sample requirements would map differently under this version."],
      ],
      keys: [
        ["↑ ↓ or j k", "Previous or next suggestion (in the suggestions table)"],
        ["Enter / Esc", "Open or close the suggestion"],
        ["a / r", "Accept / reject"],
        ["e", "Accept with edits"],
      ],
    },
  },
  {
    match: (path) => path.startsWith("/architecture"),
    entry: {
      title: "Catalogue",
      body: ["The catalogue version in service: what requirements are mapped against today."],
      terms: [
        ["Catalogue version", "One named state of the catalogue."],
        ["Connection", "A dependency between two systems, said as a sentence."],
        ["Put back in service", "Make a replaced catalogue version the one in service again."],
      ],
      keys: [],
    },
  },
  {
    match: (path) => path.startsWith("/squads"),
    entry: {
      title: "Ownership",
      body: ["Who runs each system in service: value streams, products, squads and people."],
      terms: [
        ["Squad", "A team that runs systems."],
        ["Contact", "The person in a squad to ask about a system."],
        ["Gap", "A system in service with no squad, or no contact."],
      ],
      keys: [],
    },
  },
  {
    match: (path) => path.startsWith("/historic"),
    entry: {
      title: "Historic requirements",
      body: ["Old BRDs imported with the Azure DevOps work items they were delivered as. Published, they are reference knowledge, read as prior art."],
      terms: [["Historic requirement", "A past requirement imported from BRDs to inform new work."]],
      keys: [],
    },
  },
  {
    match: (path) => path.startsWith("/explorer"),
    entry: {
      title: "Product architecture explorer",
      body: ["Choose an offering and an order type to see the systems that take part. It shows the catalogue in service only."],
      terms: [["Journey", "The steps through systems for one offering, order type and channel."]],
      keys: [],
    },
  },
  {
    match: (path) => path === "/",
    entry: {
      title: "To do",
      body: [
        "Everything that needs you, most urgent first. Switch to Everyone's to see the whole team's. Order lists each kind by how long it has waited instead; Find narrows them by name.",
        "Start opens a review or a draft's decisions in focus mode, one question at a time. Re-confirmations are confirmed here, on their card.",
      ],
      terms: [
        ["Needs attention", "A failed job or blocked item someone must act on."],
        ["Job", "Background work: reading, indexing, building, checking."],
        ["Re-confirmation", "Confirming a document or system is still right, when due."],
        ["Gap", "A system in service with no squad, or no contact. Gaps are listed, not counted in To do's number."],
        ["New", "Began waiting after your last visit to To do, in this browser."],
      ],
      keys: [["/", "Find in To do (with page-wide shortcuts on)"]],
    },
  },
];

export function helpFor(path: string): HelpEntry {
  return PAGES.find((page) => page.match(path))?.entry ?? NEUTRAL;
}
