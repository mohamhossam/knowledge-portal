-- How far a queued job has got, so a curator can see a long reading move: when it was
-- last asked for, when its current attempt started, and the stage and part it is on.
-- Both queues share one repository, so both tables carry the columns.

ALTER TABLE architecture_jobs
    ADD COLUMN queued_at timestamp with time zone DEFAULT now() NOT NULL,
    ADD COLUMN started_at timestamp with time zone,
    ADD COLUMN stage text,
    ADD COLUMN progress_done integer,
    ADD COLUMN progress_total integer;
UPDATE architecture_jobs SET queued_at = created_at;

ALTER TABLE historic_import_jobs
    ADD COLUMN queued_at timestamp with time zone DEFAULT now() NOT NULL,
    ADD COLUMN started_at timestamp with time zone,
    ADD COLUMN stage text,
    ADD COLUMN progress_done integer,
    ADD COLUMN progress_total integer;
UPDATE historic_import_jobs SET queued_at = created_at;
