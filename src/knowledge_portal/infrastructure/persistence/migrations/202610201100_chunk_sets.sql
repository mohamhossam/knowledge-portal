-- Chunk sets: a document version's chunks, or a catalogue's record chunks, stored once under a
-- key of what they were cut from and how, and shared by every index built from the same
-- content. An index is then its own links plus the sets it reads (its members), so a rebuild
-- re-parses, re-chunks, re-embeds and re-stores only what changed. Indexes built before this
-- hold their chunks themselves and read as before.

-- Fail fast rather than queue behind live traffic: an ALTER that waits for its lock blocks every
-- query behind it. The runner applies every pending migration in one transaction, so a timeout
-- rolls back this run's migrations together, and the setting holds for the ones after it
-- (docs/operations/deployment.md, "Catalogue evidence").
SET LOCAL lock_timeout = '5s';

ALTER TABLE architecture_knowledge_indexes
    ADD COLUMN kind text DEFAULT 'release' NOT NULL,
    -- Unread sets are collected only after a grace period, so a build that has just found a
    -- set never loses it before naming it as a member.
    ADD COLUMN created_at timestamp with time zone DEFAULT now() NOT NULL,
    ALTER COLUMN release_id DROP NOT NULL,
    ADD CONSTRAINT architecture_knowledge_indexes_kind_check CHECK (kind IN ('release', 'set')),
    -- A set belongs to no release: releases reach it through their members.
    ADD CONSTRAINT architecture_knowledge_indexes_set_check
        CHECK ((kind = 'set') = (release_id IS NULL));

-- A set keeps its chunks in the order they were cut, so a build that reuses it sees them so.
ALTER TABLE architecture_knowledge_chunks ADD COLUMN position integer;

CREATE TABLE architecture_index_members (
    index_id text NOT NULL
        REFERENCES architecture_knowledge_indexes (index_id) ON DELETE CASCADE,
    member_id text NOT NULL REFERENCES architecture_knowledge_indexes (index_id),
    PRIMARY KEY (index_id, member_id)
);

CREATE INDEX architecture_index_members_member_idx ON architecture_index_members (member_id);

-- A link belongs to the index that made it (index_id); the chunk it links may live in one of
-- that index's sets (source_id).
ALTER TABLE architecture_chunk_entities ADD COLUMN source_id text;
UPDATE architecture_chunk_entities SET source_id = index_id;
ALTER TABLE architecture_chunk_entities
    ALTER COLUMN source_id SET NOT NULL,
    DROP CONSTRAINT architecture_chunk_entities_index_id_chunk_id_fkey,
    ADD CONSTRAINT architecture_chunk_entities_source_fkey FOREIGN KEY (source_id, chunk_id)
        REFERENCES architecture_knowledge_chunks (index_id, chunk_id) ON DELETE CASCADE,
    ADD CONSTRAINT architecture_chunk_entities_index_fkey FOREIGN KEY (index_id)
        REFERENCES architecture_knowledge_indexes (index_id) ON DELETE CASCADE;

ALTER TABLE architecture_chunk_concepts ADD COLUMN source_id text;
UPDATE architecture_chunk_concepts SET source_id = index_id;
ALTER TABLE architecture_chunk_concepts
    ALTER COLUMN source_id SET NOT NULL,
    DROP CONSTRAINT architecture_chunk_concepts_index_id_chunk_id_fkey,
    ADD CONSTRAINT architecture_chunk_concepts_source_fkey FOREIGN KEY (source_id, chunk_id)
        REFERENCES architecture_knowledge_chunks (index_id, chunk_id) ON DELETE CASCADE;

-- Passages a curator marked as describing what the catalogue no longer holds: kept and
-- readable, never searched by the index that marks them (a child, through its parent too).
CREATE TABLE architecture_index_outdated (
    index_id text NOT NULL
        REFERENCES architecture_knowledge_indexes (index_id) ON DELETE CASCADE,
    chunk_id text NOT NULL,
    PRIMARY KEY (index_id, chunk_id)
);
