-- ADR-0129: the need facets each requirement was last assessed with, successfully, so its
-- decided precedent is compared by them. One row per requirement, replaced by the next
-- successful assessment and, like precedents, never pruned.

CREATE TABLE architecture_requirement_needs (
    requirement_id text PRIMARY KEY,
    release_id text NOT NULL,
    reader_model text NOT NULL,
    needs jsonb NOT NULL,
    assessed_at timestamp with time zone NOT NULL DEFAULT now()
);
