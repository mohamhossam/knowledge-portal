-- Section-v4 evidence (ADR section-v4): a document is indexed as parents, which the reasoner reads,
-- and children, which are searched. Earlier indexes hold only whole chunks and read as before.

-- Fail fast rather than queue behind live traffic: an ALTER that waits for its lock blocks every
-- query behind it. The migration runs in one transaction, so a timeout rolls it back whole and
-- the deployment retries it (docs/operations/deployment.md, "Catalogue evidence").
SET LOCAL lock_timeout = '5s';

ALTER TABLE architecture_knowledge_chunks
    ADD COLUMN role text DEFAULT 'whole' NOT NULL,
    ADD COLUMN parent_id text,
    -- Other places in the same document with exactly this text, indexed once.
    ADD COLUMN aliases text[] DEFAULT '{}'::text[] NOT NULL,
    ADD CONSTRAINT architecture_knowledge_chunks_role_check
        CHECK (role IN ('whole', 'child', 'parent')),
    ADD CONSTRAINT architecture_knowledge_chunks_parent_check
        CHECK ((role = 'child') = (parent_id IS NOT NULL));

-- A parent is never searched, so it has no embedding; every other chunk keeps one.
ALTER TABLE architecture_knowledge_chunks ALTER COLUMN embedding DROP NOT NULL;
ALTER TABLE architecture_knowledge_chunks
    ADD CONSTRAINT architecture_knowledge_chunks_embedding_check
        CHECK ((role = 'parent') = (embedding IS NULL));

ALTER TABLE architecture_knowledge_chunks
    ADD CONSTRAINT architecture_knowledge_chunks_parent_fkey
        FOREIGN KEY (index_id, parent_id)
        REFERENCES architecture_knowledge_chunks (index_id, chunk_id) ON DELETE CASCADE;

CREATE INDEX architecture_chunks_parent_idx
    ON architecture_knowledge_chunks (index_id, parent_id) WHERE parent_id IS NOT NULL;
