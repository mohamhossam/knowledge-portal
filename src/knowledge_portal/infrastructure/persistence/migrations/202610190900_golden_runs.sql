-- Golden set report (Catalogue > Golden set report): stored runs of the impact mapper over the
-- golden set, and their own job queue. The queue is separate so the catalogue's worker never
-- claims a run, which scores with the configured models for minutes.

CREATE TABLE golden_runs (
    run_id text PRIMARY KEY,
    actor_id text NOT NULL,
    requested_at timestamp with time zone NOT NULL,
    options text NOT NULL,
    -- Null until the run finishes; scores and every case's answer, as the report shows them.
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX golden_runs_newest ON golden_runs (requested_at DESC);
CREATE INDEX golden_runs_unfinished ON golden_runs (requested_at) WHERE result IS NULL;

CREATE TABLE golden_run_jobs (
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
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    stage text,
    progress_done integer,
    progress_total integer,
    UNIQUE (kind, subject_id, fingerprint)
);
