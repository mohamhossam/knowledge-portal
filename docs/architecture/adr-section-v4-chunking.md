# ADR — Section-v4: catalogue documents as parents to read and children to search

## Status

Proposed 2026-10-20. The number is for the owner to assign: the platform-level ADRs in
requirement-portal share this series (ADR-0115 there is the verdict rules). Built beside
section-v3, which stays the default (`ARCHITECTURE_INDEX_VERSION`) until the Golden set
report compares both with live models.

## Context

A catalogue upload (an SDD, a solution design) is parsed into located passages and packed
into chunks of up to 400 tokens under "title / heading / subheading", cut into 500-token
windows with 75 tokens of overlap when longer (section-v3). The same chunk is embedded,
searched, reranked, read by the verdict reasoner and quoted.

A dry run on a real-shaped Word document (the "Catalogue Chunking Proposal" page) showed:

- The assessment searches with short facets (10–30 tokens), but a packed chunk mixes several
  topics, so a facet matches a 400-token block that is mostly about other things.
- Windows cut mid-sentence; the full heading path repeats in every chunk and weighs on keyword
  scores and vectors; tiny paragraphs become header-only chunks.
- A table's header row is a chunk of its own; a row spanning the table (a note) gets a column
  label; the caption above a table is in another chunk than its rows.
- The Title paragraph takes heading level 1; Word content controls (`w:sdt`) are dropped, so
  text inside them is lost; Word numbering ("2.1", list bullets) is lost.
- Identical text in one document is embedded twice.
- Document passages are linked to concepts only, never to the systems they name, and the
  passage lane caps two passages per *document* per facet, so one long SDD loses relevant
  sections to the cap.

## Decision

1. **Parents and children.** Under section-v4 a document is indexed as *parents* (a section's
   paragraphs up to 600 tokens, or one table with its caption and columns), which the reasoner
   reads, and *children* (one paragraph, short paragraphs joined, groups of whole sentences of a
   long one, or one table row), which are embedded and searched. `EvidenceChunk` gains `role`
   (`whole`, `child`, `parent`), `parent_id`, `aliases` and `focus`.
2. **Rules** (`application/use_cases/section_chunking.py`): the title is body text (P1); a
   table's header row names its columns (P2); a row whose one value spans the columns is a note
   (P3); a caption-styled or short paragraph just before a table is its caption (P4); parents of
   at most 600 tokens split at sentence ends (C1); children of 40 to 220 tokens, long paragraphs
   in groups of about 160 tokens of whole sentences sharing one sentence (C2); a table row is a
   child embedded with a line naming its table (C3); a child is embedded under a compact header,
   "document › nearest heading", while the parent carries the full path (C4); every child is an
   exact slice of its parent (C5); text repeated in one document is indexed once, the other
   places kept as aliases (C6). Catalogue records keep their text and pack whole lines into
   500-token windows that repeat the last line.
3. **Search children, read parents.** Indexes never search parents (no embedding; filtered in
   every query). `readable()` turns ranked children into their parents, once each, at the best
   child's place, with `focus` naming it. The passage lane reranks children, reads parents, and
   counts the per-entity cap per *section* (a parent is its own entity); `/match` evidence and the
   draft's preview read the same way.
4. **Parser fixes for every version.** The Word reader reads content controls as "control N,
   paragraph M" (body paragraph numbers do not move; a table of contents is left out), and says
   each paragraph's number or bullet (`label`), list depth, and whether it is the title or a
   caption, beside the text, never in it, so section-v3 chunks keep their text and hash.
5. **Passages name systems.** Under section-v4 every document parent and child is linked
   (`EntityRole.MENTIONS`) to the catalogue systems and offerings it names, by the catalogue's own
   names, aliases and codes (the matcher `/match` uses). Within the first six reranked children of
   a facet, those naming a candidate system come first. A mention is a deterministic name match,
   so documents still never select a system (ADR-0114). The evidence page shows the entries a
   passage names and where its text repeats.
6. **Versions read each other.** An index of section-v2, v3 or v4 with the same embedding model
   and tokenizer is read by any build, so switching `ARCHITECTURE_INDEX_VERSION` back needs no
   rebuild. A release built under v4 publishes only while v4 is configured, as today.

## Consequences

- **Win:** a facet matches a unit about one thing; the reasoner still reads the section; a
  citation names the matched part (`focus`); tables and captions stay together; text lost in
  content controls is recovered; a long SDD is no longer capped at two passages per facet;
  a curator sees which systems a passage names.
- **Lose:** more rows per document (parents plus children, about twice v3's count); two
  queries' worth of reading per hit (the parent is fetched); a migration
  (`202610201000_chunk_parents`: `role`, `parent_id`, `aliases`, nullable `embedding` with a
  check); one more setting.
- **Risk — ranking change unmeasured.** The fake models in CI show the path, not the quality.
  Switching the default needs the Golden set report on both versions with live models (three
  runs each): systems found and systems correct up by more than the runs' spread, citation
  faithfulness unchanged. Until then v4 is a HYPOTHESIS.
- **Risk — the cap per section** lets one document fill a facet's three places. The facets'
  turn-taking and the 12-passage budget still bound it; the golden comparison decides.
- **Not done here** (recorded in AGENTS.md §19): indexing embedded Word, Excel and PowerPoint
  parts and figure text; a layout-aware PDF reader; a malware scan for catalogue uploads.
