-- Knowledge Center C: a knowledge admin acting on a library document they don't own.
-- A grant opens the owner's view to one admin for a while, with a reason; the record
-- keeps every override and bulk action, with the state before and after.

CREATE TABLE library_admin_grants (
    grant_id text PRIMARY KEY,
    document_id text NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
    actor_id text NOT NULL,
    actor_name text NOT NULL,
    reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
    granted_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    CHECK (expires_at > granted_at)
);

-- One open grant per admin and document.
CREATE UNIQUE INDEX library_admin_grants_open
    ON library_admin_grants (document_id, actor_id) WHERE ended_at IS NULL;

CREATE TABLE library_admin_record (
    record_id text PRIMARY KEY,
    -- Orders records made in the same instant, as they were made.
    seq bigserial NOT NULL,
    action text NOT NULL CHECK (action IN (
        'grant', 'end', 'reassign', 'withdraw', 'review', 'approve',
        'retry_reading', 'retry_indexing'
    )),
    document_ids text[] NOT NULL,
    actor_id text NOT NULL,
    actor_name text NOT NULL,
    reason text,
    before jsonb,
    after jsonb,
    acted_at timestamp with time zone NOT NULL
);

CREATE INDEX library_admin_record_by_document
    ON library_admin_record USING gin (document_ids);
