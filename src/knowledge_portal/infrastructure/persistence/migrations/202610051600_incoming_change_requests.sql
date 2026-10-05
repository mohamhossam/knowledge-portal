-- Change requests from Requirement AI waiting for a knowledge admin
-- (requirement-portal ADR-0101, step 7). One row per final approval: a second
-- delivery of the same approval finds its row and changes nothing.

CREATE TABLE incoming_change_requests (
    change_request_id text PRIMARY KEY,
    approval_id text NOT NULL UNIQUE,
    subject_fingerprint text NOT NULL,
    status text NOT NULL CHECK (status IN ('waiting', 'read', 'dismissed')),
    payload jsonb NOT NULL,
    received_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone
);

CREATE INDEX incoming_change_requests_by_status
    ON incoming_change_requests (status, received_at);
