/** Help panel content per area (interaction model §14). Wording follows docs/ux/content. */
export type HelpEntry = { title: string; body: string[]; terms: [string, string][]; keys: [string, string][] };

const GLOBAL_KEYS: [string, string][] = [
  ["?", "Open this help"],
  ["g w / l / c / o / r", "Go to Your work, Library, Catalogue, Ownership or Requirements"],
  ["g j", "Open Jobs"],
  ["/", "Find on this page"],
  ["Esc", "Close a panel and go back to what opened it"],
];

const AREAS: { prefix: string; entry: HelpEntry }[] = [
  {
    prefix: "/library/",
    entry: {
      title: "Reviewing a document",
      body: [
        "Move through the passages, keep, edit or exclude each, then save your review.",
        "Approving publishes the reviewed passages: requirement work can cite them from then on.",
      ],
      terms: [
        ["Passage", "One reviewed unit of a document's text that can be cited."],
        ["Flagged", "Has a warning from reading."],
        ["Blocks approval", "A warning that must be resolved: exclude the passage, or upload a new version."],
        ["Seen", "A passage you opened or moved through in this review."],
      ],
      keys: [
        ["↑ ↓ or j k", "Previous or next passage"],
        ["n / Shift+n", "Next or previous flagged or unseen passage"],
        ["x / i", "Exclude (then give the reason) / include"],
        ["e", "Edit the text"],
        ["o", "Show the original"],
        ["Space", "Select for a bulk action"],
        ["Ctrl+Enter", "Save the review"],
      ],
    },
  },
  {
    prefix: "/library",
    entry: {
      title: "Library",
      body: ["Reviewed reference documents that requirement work can cite. Upload, review, approve, withdraw."],
      terms: [
        ["In service", "The published version requirement work cites now."],
        ["Cited by", "The requirements that cite a document (only those you can see)."],
      ],
      keys: [],
    },
  },
  {
    prefix: "/architecture/versions/",
    entry: {
      title: "Preparing a catalogue version",
      body: [
        "A draft goes through five steps: Sources, Decide, Changes, Check, Publish.",
        "Decisions show at once and are sent after 6 seconds; press Undo (z) before then to take one back.",
      ],
      terms: [
        ["Suggested", "Something a model proposed from a source that nobody has decided yet."],
        ["Stated / inferred", "Whether the source says it outright or the model inferred it."],
        ["Mapping impact", "How requirement work's mappings would differ under this version."],
      ],
      keys: [
        ["↑ ↓ or j k", "Previous or next suggestion"],
        ["n", "Next suggestion that needs you"],
        ["a / r", "Accept / reject (with a 6 s undo)"],
        ["e", "Accept with edits"],
        ["z", "Undo the last decision"],
      ],
    },
  },
  {
    prefix: "/architecture",
    entry: {
      title: "Catalogue",
      body: ["The catalogue version in service: what requirement work maps against today."],
      terms: [
        ["Catalogue version", "One named state of the catalogue."],
        ["Connection", "A dependency between two systems, said as a sentence."],
        ["Put back in service", "Make a replaced catalogue version the one in service again."],
      ],
      keys: [["↓ ↑ in Find", "Move through matches; Enter opens one"]],
    },
  },
  {
    prefix: "/ownership",
    entry: {
      title: "Ownership",
      body: ["Who runs each system in service. A gap is a system with no squad or no contact."],
      terms: [
        ["Squad", "A team that runs systems."],
        ["Contact", "The person in a squad to ask about a system."],
      ],
      keys: [],
    },
  },
  {
    prefix: "/explorer",
    entry: {
      title: "Product architecture explorer",
      body: ["Choose an offering, an order type and a channel to see the systems that take part. It shows the catalogue in service only."],
      terms: [["Journey", "The steps through systems for one offering, order type and channel."]],
      keys: [],
    },
  },
  {
    prefix: "/re-confirmations",
    entry: {
      title: "Re-confirmations",
      body: ["Documents and systems that must be confirmed as still right, by their due date."],
      terms: [["Re-confirmation", "Confirming a document or system is still right, when due."]],
      keys: [],
    },
  },
  {
    prefix: "",
    entry: {
      title: "Your work",
      body: ["Everything that needs you, most urgent first. Switch to Everyone's to see the whole team's."],
      terms: [
        ["Needs attention", "A failed job or blocked item someone must act on."],
        ["Job", "Background work: reading, indexing, building, checking."],
      ],
      keys: [],
    },
  },
];

export function helpFor(path: string): { entry: HelpEntry; global: [string, string][] } {
  const found = AREAS.find((area) => path.startsWith(area.prefix)) ?? AREAS[AREAS.length - 1]!;
  return { entry: found.entry, global: GLOBAL_KEYS };
}
