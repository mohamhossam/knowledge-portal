-- Knowledge Center D: confirming knowledge is still right, on a cycle.
-- A catalogue system's confirmations live outside the versioned release, keyed by its id,
-- which carries from version to version. Append-only: the latest row per system is its
-- last review, and the rows are its history.

CREATE TABLE system_reviews (
    review_id text PRIMARY KEY,
    -- Orders confirmations made in the same instant, as they were made.
    seq bigserial NOT NULL,
    system_id text NOT NULL,
    reviewed_at timestamp with time zone NOT NULL,
    reviewer_id text NOT NULL,
    reviewer_name text NOT NULL,
    note text CHECK (note IS NULL OR length(note) BETWEEN 1 AND 500),
    on_behalf_admin_id text,
    on_behalf_admin_name text,
    on_behalf_reason text CHECK (on_behalf_reason IS NULL OR length(on_behalf_reason) BETWEEN 1 AND 500),
    CHECK ((on_behalf_admin_id IS NULL) = (on_behalf_reason IS NULL))
);

CREATE INDEX system_reviews_latest ON system_reviews (system_id, reviewed_at DESC, seq DESC);

-- A library document's confirmation on its owner's behalf joins the admin record.
ALTER TABLE library_admin_record DROP CONSTRAINT library_admin_record_action_check;
ALTER TABLE library_admin_record ADD CONSTRAINT library_admin_record_action_check CHECK (action IN (
    'grant', 'end', 'reassign', 'withdraw', 'review', 'approve',
    'retry_reading', 'retry_indexing', 'confirm_review'
));
