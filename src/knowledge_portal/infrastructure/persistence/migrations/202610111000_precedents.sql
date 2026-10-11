-- Ontology plan Phase 5: verdicts a reviewer decided in requirement work, one row per
-- requirement analysis. The text's embedding is kept with the model that made it, so the
-- assessment's precedent lane compares only vectors of the model it embeds with.

CREATE TABLE architecture_precedents (
    precedent_id text PRIMARY KEY,
    requirement_id text NOT NULL,
    release_id text NOT NULL,
    decision text NOT NULL CHECK (decision IN ('accepted', 'overridden', 'unknown')),
    verdict text,
    decided_at timestamp with time zone NOT NULL,
    payload jsonb NOT NULL,
    embedding_model text NOT NULL,
    embedding vector(768) NOT NULL,
    received_at timestamp with time zone NOT NULL
);

CREATE INDEX architecture_precedents_release_idx
    ON architecture_precedents USING btree (release_id, decided_at);
CREATE INDEX architecture_precedents_model_idx
    ON architecture_precedents USING btree (embedding_model)
    WHERE verdict IS NOT NULL;
