-- knowledge-portal baseline (requirement-portal ADR-0099).
--
-- The knowledge-owned tables exactly as requirement-portal's migrations leave
-- them at 202610021400, dumped from a fully migrated database: the library,
-- the architecture catalogue and its jobs, the organisation catalogue, this
-- service's blobs and event outbox, and the admins it has seen sign in.
-- A pg_dump of this schema equals one of those tables in requirement-portal,
-- so the data import (Stage 3.4) copies rows unchanged. Changes from here on
-- are new migrations in this repository only.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE actor_profiles (
    actor_id text NOT NULL,
    payload jsonb NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE architecture_catalogue_candidates (
    candidate_id text NOT NULL,
    release_id text NOT NULL,
    document_version_id text NOT NULL,
    status text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE architecture_embedding_cache (
    model text NOT NULL,
    content_hash text NOT NULL,
    embedding vector(768) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE architecture_extraction_runs (
    run_id text NOT NULL,
    release_id text NOT NULL,
    document_version_id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE architecture_jobs (
    job_id text NOT NULL,
    kind text NOT NULL,
    subject_id text NOT NULL,
    fingerprint text NOT NULL,
    actor_id text NOT NULL,
    status text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    error_category text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE architecture_knowledge_audit (
    audit_id bigint NOT NULL,
    release_id text NOT NULL,
    actor_id text NOT NULL,
    action text NOT NULL,
    revision integer NOT NULL,
    rationale text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE architecture_knowledge_audit ALTER COLUMN audit_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME architecture_knowledge_audit_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE architecture_knowledge_chunks (
    index_id text NOT NULL,
    chunk_id text NOT NULL,
    document_version_id text,
    source_label text NOT NULL,
    location text NOT NULL,
    content text NOT NULL,
    search_text tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, content)) STORED,
    embedding vector(768) NOT NULL
);

CREATE TABLE architecture_knowledge_documents (
    version_id text NOT NULL,
    payload jsonb NOT NULL,
    published boolean DEFAULT false NOT NULL
);

CREATE TABLE architecture_knowledge_indexes (
    index_id text NOT NULL,
    release_id text NOT NULL
);

CREATE TABLE architecture_knowledge_releases (
    release_id text NOT NULL,
    revision integer NOT NULL,
    payload jsonb NOT NULL,
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE architecture_sample_requirements (
    set_id smallint DEFAULT 1 NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT architecture_sample_requirements_set_id_check CHECK ((set_id = 1))
);

CREATE TABLE knowledge_document_blobs (
    document_version_id text NOT NULL,
    checksum_sha256 text NOT NULL,
    size_bytes bigint NOT NULL,
    content bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_document_blobs_check CHECK ((octet_length(content) = size_bytes)),
    CONSTRAINT knowledge_document_blobs_checksum_sha256_check CHECK ((checksum_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT knowledge_document_blobs_size_bytes_check CHECK ((size_bytes > 0))
);

CREATE TABLE knowledge_events (
    seq bigint NOT NULL,
    kind text NOT NULL,
    subject_id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE knowledge_events_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE knowledge_events_seq_seq OWNED BY knowledge_events.seq;

CREATE TABLE library_chunks (
    identity text NOT NULL,
    id text NOT NULL,
    document_id text NOT NULL,
    publication_id text NOT NULL,
    search_text text NOT NULL,
    payload jsonb NOT NULL,
    embedding vector(768) NOT NULL,
    lexical tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, search_text)) STORED
);

CREATE TABLE library_documents (
    id text NOT NULL,
    owner_id text NOT NULL,
    version integer NOT NULL,
    published_id text,
    payload jsonb NOT NULL,
    CONSTRAINT library_documents_version_check CHECK ((version > 0))
);

CREATE TABLE library_embedding_cache (
    identity text NOT NULL,
    content_hash text NOT NULL,
    embedding vector(768) NOT NULL
);

CREATE TABLE library_submissions (
    owner_id text NOT NULL,
    submission_key text NOT NULL,
    document_id text NOT NULL,
    version_id text NOT NULL
);

CREATE TABLE organisation_audit (
    audit_id bigint NOT NULL,
    actor_id text NOT NULL,
    action text NOT NULL,
    subject_id text NOT NULL,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE organisation_audit ALTER COLUMN audit_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME organisation_audit_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE organisation_catalogue (
    catalogue_id smallint DEFAULT 1 NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organisation_catalogue_catalogue_id_check CHECK ((catalogue_id = 1))
);

ALTER TABLE ONLY knowledge_events ALTER COLUMN seq SET DEFAULT nextval('knowledge_events_seq_seq'::regclass);

ALTER TABLE ONLY actor_profiles
    ADD CONSTRAINT actor_profiles_pkey PRIMARY KEY (actor_id);

ALTER TABLE ONLY architecture_catalogue_candidates
    ADD CONSTRAINT architecture_catalogue_candidates_pkey PRIMARY KEY (candidate_id);

ALTER TABLE ONLY architecture_embedding_cache
    ADD CONSTRAINT architecture_embedding_cache_pkey PRIMARY KEY (model, content_hash);

ALTER TABLE ONLY architecture_extraction_runs
    ADD CONSTRAINT architecture_extraction_runs_pkey PRIMARY KEY (run_id);

ALTER TABLE ONLY architecture_jobs
    ADD CONSTRAINT architecture_jobs_kind_subject_id_fingerprint_key UNIQUE (kind, subject_id, fingerprint);

ALTER TABLE ONLY architecture_jobs
    ADD CONSTRAINT architecture_jobs_pkey PRIMARY KEY (job_id);

ALTER TABLE ONLY architecture_knowledge_audit
    ADD CONSTRAINT architecture_knowledge_audit_pkey PRIMARY KEY (audit_id);

ALTER TABLE ONLY architecture_knowledge_chunks
    ADD CONSTRAINT architecture_knowledge_chunks_pkey PRIMARY KEY (index_id, chunk_id);

ALTER TABLE ONLY architecture_knowledge_documents
    ADD CONSTRAINT architecture_knowledge_documents_pkey PRIMARY KEY (version_id);

ALTER TABLE ONLY architecture_knowledge_indexes
    ADD CONSTRAINT architecture_knowledge_indexes_pkey PRIMARY KEY (index_id);

ALTER TABLE ONLY architecture_knowledge_releases
    ADD CONSTRAINT architecture_knowledge_releases_pkey PRIMARY KEY (release_id);

ALTER TABLE ONLY architecture_sample_requirements
    ADD CONSTRAINT architecture_sample_requirements_pkey PRIMARY KEY (set_id);

ALTER TABLE ONLY knowledge_document_blobs
    ADD CONSTRAINT knowledge_document_blobs_pkey PRIMARY KEY (document_version_id);

ALTER TABLE ONLY knowledge_events
    ADD CONSTRAINT knowledge_events_pkey PRIMARY KEY (seq);

ALTER TABLE ONLY library_chunks
    ADD CONSTRAINT library_chunks_pkey PRIMARY KEY (identity, id);

ALTER TABLE ONLY library_documents
    ADD CONSTRAINT library_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY library_embedding_cache
    ADD CONSTRAINT library_embedding_cache_pkey PRIMARY KEY (identity, content_hash);

ALTER TABLE ONLY library_submissions
    ADD CONSTRAINT library_submissions_pkey PRIMARY KEY (owner_id, submission_key);

ALTER TABLE ONLY organisation_audit
    ADD CONSTRAINT organisation_audit_pkey PRIMARY KEY (audit_id);

ALTER TABLE ONLY organisation_catalogue
    ADD CONSTRAINT organisation_catalogue_pkey PRIMARY KEY (catalogue_id);

CREATE INDEX architecture_catalogue_candidates_release_idx ON architecture_catalogue_candidates USING btree (release_id, document_version_id, status);

CREATE INDEX architecture_chunks_search_idx ON architecture_knowledge_chunks USING gin (search_text);

CREATE INDEX architecture_extraction_runs_release_idx ON architecture_extraction_runs USING btree (release_id, created_at);

CREATE UNIQUE INDEX architecture_one_active_release ON architecture_knowledge_releases USING btree (active) WHERE active;

CREATE INDEX library_chunks_lexical ON library_chunks USING gin (lexical);

CREATE INDEX library_chunks_publication ON library_chunks USING btree (document_id, publication_id);

CREATE INDEX library_chunks_semantic ON library_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX library_documents_owner ON library_documents USING btree (owner_id, id);

CREATE INDEX library_documents_published ON library_documents USING btree (id) WHERE (published_id IS NOT NULL);

ALTER TABLE ONLY architecture_knowledge_chunks
    ADD CONSTRAINT architecture_knowledge_chunks_index_id_fkey FOREIGN KEY (index_id) REFERENCES architecture_knowledge_indexes(index_id);

ALTER TABLE ONLY architecture_knowledge_indexes
    ADD CONSTRAINT architecture_knowledge_indexes_release_id_fkey FOREIGN KEY (release_id) REFERENCES architecture_knowledge_releases(release_id);

ALTER TABLE ONLY library_chunks
    ADD CONSTRAINT library_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES library_documents(id);

ALTER TABLE ONLY library_submissions
    ADD CONSTRAINT library_submissions_document_id_fkey FOREIGN KEY (document_id) REFERENCES library_documents(id);
