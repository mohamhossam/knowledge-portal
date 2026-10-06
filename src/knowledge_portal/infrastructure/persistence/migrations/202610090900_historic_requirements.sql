-- Knowledge Center E1: historic Requirements, imported read-only from old BRDs and their
-- Azure DevOps breakdown (ADR-0102). One row per historic Requirement; its BRDs, breakdown,
-- current import run and publications live in the payload, written with optimistic versions.

CREATE TABLE historic_requirements (
    historic_requirement_id text PRIMARY KEY,
    version integer NOT NULL CHECK (version >= 1),
    status text NOT NULL CHECK (status IN ('draft', 'published', 'withdrawn')),
    title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb NOT NULL
);

CREATE INDEX historic_requirements_newest ON historic_requirements (created_at DESC);
CREATE INDEX historic_requirements_status ON historic_requirements (status);

-- Its own queue: an import's reads must never be claimed by the catalogue's worker.
CREATE TABLE historic_import_jobs (
    job_id text PRIMARY KEY,
    kind text NOT NULL,
    subject_id text NOT NULL,
    fingerprint text NOT NULL,
    actor_id text NOT NULL,
    status text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    error_category text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (kind, subject_id, fingerprint)
);
