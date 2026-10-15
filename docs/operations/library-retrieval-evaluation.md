# Reference library: retrieval evaluation

The library's search has a golden set and a command that scores it, as the impact mapper has
(`docs/slices/ontology-phase-0-baseline.md`). It is the first step of the RAG review
([review](https://claude.ai/code/artifact/425be595-fc00-467f-908a-7465d6dd2b75), Phase A, E1):
measure retrieval before changing chunk sizes, the lexical configuration or adding a reranker.

## What is measured

`tests/fixtures/golden/library_golden_set.json` holds a small corpus and twenty queries. The
corpus starts from the library documents `scripts/seed_demo.py` publishes, word for word, and
adds six short fixture documents so there is something to rank. Each case is a requirement
(title and description) or a rule sentence, with the passages a knowledge admin would expect
among the first answers: a document title and either a passage the chunk must contain or the
block label it must carry. **The set is a fixture, not user evidence**: no case comes from a
historic requirement or from a real search, and the file's `provenance` says so.

The command seeds the corpus in memory through the worker's own path (submit, read, review with
every block kept, approve, index; one document is then withdrawn), searches every case through
`ReferenceKnowledge.search`, and scores the first ten chunks of each answer, the most
`retrieve` ever hands to requirement work:

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

`--json` writes the scores, the model and index identity, and each case's answer (every chunk
with its rank, document, location, text and whether it was expected), so two runs can be
compared case by case. `--golden-set` points at another file of the same shape.

## The recorded floors

With the fake embedding on the fixture (`tests/unit/test_library_evaluation.py`):

| Score | Measured 2026-10-15 | Floor |
| --- | --- | --- |
| recall@10 | 100.0% | ≥ 95% |
| mean reciprocal rank | 95.7% | ≥ 90% |
| zero-hit share | 0.0% | ≤ 5% |

The fake embedding hashes words, so a query that shares words with its passage ranks it first,
and every such case does. The corpus holds 36 chunks, so the first ten cover a third of it and
recall@10 is generous here; the rank of the first expected passage is the stricter signal, and
the test also requires it within the first three chunks for every case that shares words with
its passage. The one `semantic` case (L019) shares no words with its passage and is there to be
measured against real embeddings. With the fake it lands around rank 6 to 7, or misses, by
chance: unrelated hashed vectors tie or nearly tie, and ties are broken by chunk id, which
changes with each run's publication ids. The floors hold whether it hits or misses.

**HYPOTHESIS:** real embeddings should hold the floors and find L019 near the top. That has not
been measured yet; record the first live run here before tuning retrieval.

## Growing the set

Add cases from real searches knowledge admins recognise as right answers, and mark their
provenance. The reader refuses a duplicate id or title, a blank text, a case that expects
nothing, an expected hit on a document the corpus lacks or has withdrawn, and a passage its
document does not contain. Raise the floors when a change earns it; never lower them without a
note here.
