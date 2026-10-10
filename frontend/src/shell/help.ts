/**
 * Help panel content per page (interaction model §14, WCAG 3.2.6). The keys
 * listed are the ones each page has today: an area that rebuilds a page
 * updates its entry in the same change. Wording follows docs/ux/content.
 */
export type HelpEntry = { title: string; body: string[]; terms: [string, string][]; keys: [string, string][] };

export const PAGE_KEYS: [string, string][] = [
  ["?", "Open this help"],
  ["g w / l / c / o / r", "Go to Your work, Library, Catalogue, Ownership or Requirements"],
  ["g j", "Open Jobs"],
  ["/", "Find on this page, where the page has a find field"],
  ["Esc", "Close a panel and go back to what opened it"],
];

const NEUTRAL: HelpEntry = {
  title: "Knowledge portal",
  body: ["Curate the library, the catalogue and who runs each system, for requirement work to rely on."],
  terms: [["In service", "What requirement work uses or cites now."]],
  keys: [],
};

const PAGES: { match: (path: string) => boolean; entry: HelpEntry }[] = [
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
        "Approve and publish makes the reviewed passages citable by requirement work. Withdraw stops it citing them; Return to service publishes them again.",
      ],
      terms: [
        ["Passage", "One reviewed unit of a document's text that can be cited."],
        ["Seen", "A passage that stayed the current one for a moment in this review, in this browser tab. Passing through doesn't count."],
        ["Flagged", "Has a warning from reading."],
        ["Blocks approval", "A warning that must be resolved: exclude the passage, or upload a new version."],
        ["In service", "The published version requirement work cites now."],
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
    match: (path) => /^\/library\/[^/]+\/(cited-by|citations)$/.test(path),
    entry: {
      title: "Cited by",
      body: ["The requirements that cite this document, and the requirement content whose source changed. Each requirement's owner decides in Requirement AI."],
      terms: [
        ["Cited by", "The requirements that cite a document (only those you can see)."],
        ["Unknown, not zero", "Requirement AI didn't answer, so the count isn't known."],
      ],
      keys: [],
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
        "Reviewed reference documents that requirement work can cite. Filter by state or owner, find by title, or upload documents.",
        "Each upload is scanned and read; you review what was read and publish it before requirement work can cite it.",
      ],
      terms: [
        ["In service", "The published version requirement work cites now."],
        ["Needs attention", "Reading failed or stopped: the row says why, and the document offers the fix."],
        ["Cited by", "The requirements that cite a document (only those you can see)."],
        ["Withdraw", "Stop requirement work citing a document."],
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
        ["Mapping impact", "How requirement work's mappings would differ under this version."],
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
      body: ["The catalogue version in service: what requirement work maps against today."],
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
    match: (path) => path.startsWith("/requirement-knowledge"),
    entry: {
      title: "Requirements",
      body: ["What requirement work holds: requirements, possible duplicates and contradictions, and historic requirements."],
      terms: [
        ["Finding", "A possible duplicate or contradiction between requirements."],
        ["Historic requirement", "A past requirement imported from BRDs to inform new work."],
      ],
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
    match: (path) => path.startsWith("/reminders"),
    entry: {
      title: "Re-confirmations",
      body: ["Documents and systems you answer for that must be confirmed as still right, by their due date."],
      terms: [["Re-confirmation", "Confirming a document or system is still right, when due."]],
      keys: [],
    },
  },
  {
    match: (path) => path === "/",
    entry: {
      title: "Your work",
      body: ["Everything that needs you, most urgent first. Switch to Everyone's to see the whole team's."],
      terms: [
        ["Needs attention", "A failed job or blocked item someone must act on."],
        ["Job", "Background work: reading, indexing, building, checking."],
        ["Re-confirmation", "Confirming a document or system is still right, when due."],
        ["Gap", "A system in service with no squad, or no contact. Gaps are listed, not counted in Your work's number."],
      ],
      keys: [],
    },
  },
];

export function helpFor(path: string): HelpEntry {
  return PAGES.find((page) => page.match(path))?.entry ?? NEUTRAL;
}
