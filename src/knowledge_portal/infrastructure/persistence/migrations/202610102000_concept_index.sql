-- Ontology plan Phase 2: an evidence index links each chunk to the catalogue entities and
-- capability concepts it speaks of, and keeps the release's concept scheme to match
-- requirements against (ADR-0114). Indexes built before this have no rows here and a NULL
-- linked_at; they are still searched as before.

ALTER TABLE architecture_knowledge_indexes ADD COLUMN linked_at timestamp with time zone;

CREATE TABLE architecture_chunk_entities (
    index_id text NOT NULL,
    chunk_id text NOT NULL,
    entity_kind text NOT NULL,
    entity_id text NOT NULL,
    role text NOT NULL,
    PRIMARY KEY (index_id, chunk_id, entity_kind, entity_id),
    FOREIGN KEY (index_id, chunk_id)
        REFERENCES architecture_knowledge_chunks (index_id, chunk_id) ON DELETE CASCADE
);

CREATE INDEX architecture_chunk_entities_entity_idx
    ON architecture_chunk_entities USING btree (index_id, entity_kind, entity_id);

CREATE TABLE architecture_concepts (
    index_id text NOT NULL REFERENCES architecture_knowledge_indexes (index_id) ON DELETE CASCADE,
    concept_id text NOT NULL,
    pref_label text NOT NULL,
    labels text[] NOT NULL,
    path text NOT NULL,
    domain_id text,
    content text NOT NULL,
    search_text tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, content)) STORED,
    embedding vector(768) NOT NULL,
    PRIMARY KEY (index_id, concept_id)
);

CREATE INDEX architecture_concepts_search_idx ON architecture_concepts USING gin (search_text);

CREATE TABLE architecture_chunk_concepts (
    index_id text NOT NULL,
    chunk_id text NOT NULL,
    concept_id text NOT NULL,
    basis text NOT NULL,
    score double precision NOT NULL,
    PRIMARY KEY (index_id, chunk_id, concept_id),
    FOREIGN KEY (index_id, chunk_id)
        REFERENCES architecture_knowledge_chunks (index_id, chunk_id) ON DELETE CASCADE,
    FOREIGN KEY (index_id, concept_id)
        REFERENCES architecture_concepts (index_id, concept_id) ON DELETE CASCADE
);

CREATE INDEX architecture_chunk_concepts_concept_idx
    ON architecture_chunk_concepts USING btree (index_id, concept_id);
