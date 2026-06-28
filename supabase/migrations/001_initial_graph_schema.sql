-- Crypto Developer Knowledge Graph relational graph schema.
-- Designed for Supabase Postgres with pgvector enabled.

create extension if not exists vector;
create extension if not exists pgcrypto;

do $$
begin
  create type graph_node_kind as enum (
    'Primitive',
    'Protocol',
    'Action',
    'Vulnerability'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type graph_edge_kind as enum (
    'USES',
    'IMPLEMENTS',
    'CALLS',
    'DEPENDS_ON',
    'SECURED_BY',
    'EXPOSES_API',
    'HAS_ENDPOINT',
    'HAS_SDK',
    'HAS_RISK',
    'BUILDS',
    'ALTERNATIVE_TO',
    'REQUIRES',
    'BROADCASTS',
    'INDEXES',
    'SUPPORTS',
    'ENABLES',
    'IMPLEMENTED_BY',
    'USES_TEMPLATE',
    'CAN_USE_SIGNER',
    'HAS_TEST_VECTOR',
    'HAS_CLI_COMMAND',
    'ENCODES_AS',
    'VERIFIES_WITH',
    'RUNS_ON',
    'HAS_GUARDRAIL',
    'SERIALIZES_AS',
    'HASHES_TO',
    'FAILS_WITH',
    'DEBUGGED_BY',
    'HAS_LIVE_CONDITION',
    'MEASURED_BY'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists nodes (
  id text primary key,
  kind graph_node_kind not null,
  label text not null,
  summary text not null,
  theoretical_documentation text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  contexts text[] not null default '{}',
  layers text[] not null default '{}',
  source_ids text[] not null default '{}',
  embedding_model text not null default 'text-embedding-3-small',
  embedding vector(1536),
  documentation_embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nodes_id_format check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint nodes_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists edges (
  id uuid primary key default gen_random_uuid(),
  source_node_id text not null references nodes(id) on delete cascade,
  target_node_id text not null references nodes(id) on delete cascade,
  kind graph_edge_kind not null,
  context text,
  layer text,
  confidence text not null default 'medium',
  developer_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edges_no_self_loop check (source_node_id <> target_node_id),
  constraint edges_confidence check (confidence in ('low', 'medium', 'high')),
  constraint edges_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists code_snippets (
  id text primary key,
  node_id text not null references nodes(id) on delete cascade,
  title text not null,
  language text not null,
  summary text not null default '',
  code text not null,
  runtime text,
  package_hints text[] not null default '{}',
  security_notes text[] not null default '{}',
  source_ids text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  embedding_model text not null default 'text-embedding-3-small',
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint code_snippets_id_format check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint code_snippets_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists document_chunks (
  id text primary key,
  node_id text references nodes(id) on delete set null,
  source_id text not null,
  source_url text,
  title text not null,
  chunk_text text not null,
  claim text,
  metadata jsonb not null default '{}'::jsonb,
  embedding_model text not null default 'text-embedding-3-small',
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_chunks_id_format check (id ~ '^[a-z0-9][a-z0-9#-]*$'),
  constraint document_chunks_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists live_metadata_targets (
  id text primary key,
  node_id text not null references nodes(id) on delete cascade,
  kind text not null,
  network text not null,
  status text not null default 'cached',
  freshness_policy text not null default 'daily',
  last_checked_at timestamptz,
  provider_id text not null,
  provider_url text,
  provider_url_env text,
  chain_id bigint,
  contract_address text,
  registry jsonb not null default '{}'::jsonb,
  abi jsonb not null default '[]'::jsonb,
  source_ids text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_metadata_targets_id_format check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint live_metadata_targets_kind check (kind in ('registry_track', 'contract_abi')),
  constraint live_metadata_targets_registry_object check (jsonb_typeof(registry) = 'object'),
  constraint live_metadata_targets_abi_array check (jsonb_typeof(abi) = 'array'),
  constraint live_metadata_targets_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists live_metadata_checks (
  id uuid primary key default gen_random_uuid(),
  target_id text not null references live_metadata_targets(id) on delete cascade,
  key text not null,
  label text not null,
  expected jsonb,
  observed jsonb,
  verification text not null default 'unverified',
  rpc_method text,
  developer_note text,
  checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_metadata_checks_verification check (verification in ('verified', 'unverified', 'failed')),
  constraint live_metadata_checks_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (target_id, key)
);

create index if not exists nodes_kind_idx on nodes(kind);
create index if not exists nodes_tags_idx on nodes using gin(tags);
create index if not exists nodes_contexts_idx on nodes using gin(contexts);
create index if not exists nodes_metadata_idx on nodes using gin(metadata jsonb_path_ops);
create index if not exists nodes_embedding_hnsw_idx on nodes using hnsw (embedding vector_cosine_ops);
create index if not exists nodes_documentation_embedding_hnsw_idx on nodes using hnsw (documentation_embedding vector_cosine_ops);

create index if not exists edges_source_idx on edges(source_node_id);
create index if not exists edges_target_idx on edges(target_node_id);
create index if not exists edges_kind_idx on edges(kind);
create index if not exists edges_metadata_idx on edges using gin(metadata jsonb_path_ops);
create unique index if not exists edges_unique_context_idx on edges(source_node_id, kind, target_node_id, coalesce(context, ''));

create index if not exists code_snippets_node_idx on code_snippets(node_id);
create index if not exists code_snippets_language_idx on code_snippets(language);
create index if not exists code_snippets_embedding_hnsw_idx on code_snippets using hnsw (embedding vector_cosine_ops);

create index if not exists document_chunks_node_idx on document_chunks(node_id);
create index if not exists document_chunks_source_idx on document_chunks(source_id);
create index if not exists document_chunks_embedding_hnsw_idx on document_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists live_metadata_targets_node_idx on live_metadata_targets(node_id);
create index if not exists live_metadata_targets_kind_idx on live_metadata_targets(kind);
create index if not exists live_metadata_targets_registry_idx on live_metadata_targets using gin(registry jsonb_path_ops);
create index if not exists live_metadata_targets_abi_idx on live_metadata_targets using gin(abi jsonb_path_ops);
create index if not exists live_metadata_checks_target_idx on live_metadata_checks(target_id);
create index if not exists live_metadata_checks_verification_idx on live_metadata_checks(verification);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nodes_set_updated_at on nodes;
create trigger nodes_set_updated_at
before update on nodes
for each row execute function set_updated_at();

drop trigger if exists edges_set_updated_at on edges;
create trigger edges_set_updated_at
before update on edges
for each row execute function set_updated_at();

drop trigger if exists code_snippets_set_updated_at on code_snippets;
create trigger code_snippets_set_updated_at
before update on code_snippets
for each row execute function set_updated_at();

drop trigger if exists document_chunks_set_updated_at on document_chunks;
create trigger document_chunks_set_updated_at
before update on document_chunks
for each row execute function set_updated_at();

drop trigger if exists live_metadata_targets_set_updated_at on live_metadata_targets;
create trigger live_metadata_targets_set_updated_at
before update on live_metadata_targets
for each row execute function set_updated_at();

drop trigger if exists live_metadata_checks_set_updated_at on live_metadata_checks;
create trigger live_metadata_checks_set_updated_at
before update on live_metadata_checks
for each row execute function set_updated_at();

create or replace function match_nodes(
  query_embedding vector(1536),
  match_count integer default 10,
  kind_filter graph_node_kind default null
)
returns table (
  id text,
  kind graph_node_kind,
  label text,
  summary text,
  similarity double precision
)
language sql
stable
as $$
  select
    n.id,
    n.kind,
    n.label,
    n.summary,
    1 - (n.embedding <=> query_embedding) as similarity
  from nodes n
  where n.embedding is not null
    and (kind_filter is null or n.kind = kind_filter)
  order by n.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_document_chunks(
  query_embedding vector(1536),
  match_count integer default 10,
  node_filter text default null
)
returns table (
  id text,
  node_id text,
  source_id text,
  title text,
  chunk_text text,
  similarity double precision
)
language sql
stable
as $$
  select
    c.id,
    c.node_id,
    c.source_id,
    c.title,
    c.chunk_text,
    1 - (c.embedding <=> query_embedding) as similarity
  from document_chunks c
  where c.embedding is not null
    and (node_filter is null or c.node_id = node_filter)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

comment on table nodes is 'Strict graph entities. kind is one of Primitive, Protocol, Action, Vulnerability; richer legacy/domain typing belongs in metadata.';
comment on column nodes.embedding is '1536-dimensional semantic embedding of label, summary, tags, contexts, and metadata.';
comment on column nodes.documentation_embedding is '1536-dimensional semantic embedding of theoretical_documentation for deep natural-language retrieval.';
comment on table edges is 'Adjacency-list graph edges between nodes; compatible with Supabase/Postgres and easy to mirror into AGE later.';
comment on table code_snippets is 'Executable examples attached to graph nodes, with optional vector embeddings for code-aware retrieval.';
comment on table document_chunks is 'Source/document chunks that ground node claims and RAG answers.';
comment on table live_metadata_targets is 'RPC-backed registry tracks and contract ABI bindings attached to graph nodes.';
comment on table live_metadata_checks is 'Observed checks that verify whether a node claim matches live on-chain metadata or deployed contract state.';
