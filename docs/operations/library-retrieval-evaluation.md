# Reference library: retrieval evaluation

The library's search has a golden set and a command that scores it, as the impact mapper has
(`docs/slices/ontology-phase-0-baseline.md`). It is the first step of the RAG review
([review](https://claude.ai/code/artifact/425be595-fc00-467f-908a-7465d6dd2b75), Phase A, E1):
measure retrieval before changing chunk sizes, the lexical configuration or adding a reranker.

## Any product, any format

A library serves many products, and its documents follow no common structure: a Word guide
with headings and tables, a PDF service description, a sales deck, a rate card in a
spreadsheet, a CSV procedure, a long policy in Markdown. The evaluation assumes none of it.

- **A corpus document** is a file of any format the library accepts, named relative to the
  golden set file, or a short text written inline. It may name the product it belongs to.
- **An expected passage** is a piece of the document's wording, not a line number or a block
  label. Labels differ by format ("Line 3", "Paragraph 4", "Page 2", "Slide 2, paragraph 3",
  "Row 2", "Worksheet 1!2:2"), so the evaluation finds the wording wherever the extractor put
  it, ignoring case and spacing. An expected document with no passage means any of its
  passages answers.
- **A chunk answers** an expected passage when it comes from the same reviewed block and holds
  at least half of the passage, or the passage covers at least half of the chunk. A passage the
  chunker splits counts as found by either half.
- **The review** keeps every block with text and excludes what a reviewer would have to: a
  block with no text, such as a PDF page's visual, and a block a blocking extraction warning
  names. A blocking problem with no block stops the run and names the document.
- **Scores per product.** A case takes its documents' product, or names its own. The command
  prints the scores for each product, so a corpus that serves many products shows where
  retrieval is weak.

If an expected passage is not in its document as extracted, the run stops and names the case,
since the golden set no longer describes its corpus.

## The fixture

`tests/fixtures/golden/library_golden_set.json` holds 14 documents and 20 cases across seven
products, all in English: the library accepts no Arabic (a title, file, review or search
containing Arabic is refused). Eight short texts are the library documents
`scripts/seed_demo.py` publishes, word for word, one of them withdrawn. Six files under `tests/fixtures/golden/library/` are written by
`scripts/build_library_golden_corpus.py`, one product and one format each: Word, PDF,
PowerPoint, Excel, CSV and a long Markdown policy. **The set is a fixture, not user evidence**:
no case comes from a historic requirement or a real search, and the file's `provenance` says
so. Two cases are `semantic`: they share few words with their answer and are there to be
measured against real embeddings.

To change a fixture file, edit the script and run it from the repository root, then run the
evaluation. It stops if any expected passage is no longer in its document.

```bash
uv run python scripts/build_library_golden_corpus.py
```

## What is measured

The command seeds the corpus in memory through the worker's own path (submit, read, review,
approve, index; the withdrawn document is then withdrawn), searches every case through
`ReferenceKnowledge.search`, and scores the first ten chunks of each answer, the most
`retrieve` ever hands to requirement work.

| Score | Meaning |
| --- | --- |
| recall@10 | Of the passages a case expects, the share found among its first ten chunks; averaged over the cases. |
| mean reciprocal rank | 1 over the rank of the first expected passage, 0 when none is found; averaged over the cases. |
| zero-hit share | The share of cases with no expected passage among the first ten chunks. |

A case whose search fails (an unusable provider answer, a refused query) scores as a miss and
is counted as a failure, so one bad answer never stops the run. A withdrawn document must never
appear in an answer; the unit test checks it.

## Running it

Offline, with the fake hash embedding, as CI does:

```bash
LLM_PROVIDER=fake uv run python -m knowledge_portal.interfaces.evaluate --mapper library --json library-fake.json
```

Against real embeddings, point the command at the model profiles the portal runs with. The
embedding adapter, chunking policy and token counter are the container's, so the chunks scored
are the chunks the portal would serve for the same configuration:

```bash
LLM_PROVIDER=profiles LLM_CONFIG_PATH=config/llm.yaml GEMINI_API_KEY=... uv run python -m knowledge_portal.interfaces.evaluate --mapper library --json library-gemini.json
```

`config/llm.yaml`'s `embedding:` names the profile (Gemini's `gemini-embedding-001` today); its
`api_key_env` says which variable holds the key. Any other provider the settings support
(`LLM_PROVIDER=openai`, `openrouter`, `local`) works the same way with its own variables. The run
sends every chunk and every query to the embedding provider once, nothing else, and never
touches the portal's database.

Another team's corpus works the same way: put its files beside a golden set file of the same
shape and pass `--golden-set path/to/golden.json`.

`--json` writes the scores in all and per product, the model and index identity, and each
case's answer: every chunk with its rank, document, location, text and whether it was expected.
Two runs can be compared case by case.

## The recorded floors

With the fake embedding on the fixture (`tests/unit/test_library_evaluation.py`), with chunks
sized in approximate tokens and table rows searched with their column names, over 20 runs on
2026-10-15:

| Score | Measured | Floor |
| --- | --- | --- |
| recall@10 | 95.0% on every run | ≥ 90% |
| mean reciprocal rank | 80.8% to 92.5% | ≥ 75% |
| zero-hit share | 5.0% on every run | ≤ 10% |

The mean reciprocal rank moves because near-ties are broken by chunk id, and chunk ids change
with each run's publication ids. Six cases rank second or third on some runs and first on
others; if all six ranked low at once the score would be about 78%, so the floor sits below
that. The test also requires every case that shares words with its passage to rank it within
the first three chunks.

How the scores moved:

| Change | recall@10 | mean reciprocal rank | zero-hit share |
| --- | --- | --- | --- |
| Byte budget, two Arabic cases (8 runs) | 90% | 84% to 90% | 10% |
| Token budget, English only (35 runs) | 90% | 77.5% to 87.5% | 10% |
| Table rows searched with column names (20 runs) | 95% | 80.8% to 92.5% | 5% |

**Finding, fixed: a table row did not carry its column names.** L008 asks for "pooled data" on
the Fleet Plus tier; the answer is a Word table row. Extraction renders a row with cell
references ("R3C1: Fleet Plus | R3C2: 25 GB per line"), so only the header row said "Pooled
data". Tracing the search showed the answer row ranked 14th on both keyword and vector search,
and the three-chunks-per-document limit then cut it, since the guide's prose already filled its
three places. Each table row is now searched and embedded with the first row's column names
("Tier: Fleet Plus | Pooled data: 25 GB per line"); the cited text and its offsets are
unchanged. An excluded header row names nothing, so excluded text never reaches the index. L008
now ranks first or second. The per-document limit still applies before any reranking, which
matters for documents with many relevant passages; that is the next retrieval change to
measure. L020, a semantic case expecting any passage of the fleet guide, still misses with the
fake embedding.

**HYPOTHESIS:** real embeddings should hold the floors and find the semantic cases. That has not
been measured yet; record the first live run here before tuning retrieval.

## Growing the set

Add documents from the products the library serves, in the formats they arrive in, and cases
from real searches knowledge admins recognise as right answers; mark their provenance. The
reader refuses a duplicate id or title, a blank text, a document with both or neither of a
file and a text, a file outside the golden set's folder or missing, a case that expects
nothing, and an expected hit on a document the corpus lacks or has withdrawn. Raise the floors
when a change earns it; never lower them without a note here.
