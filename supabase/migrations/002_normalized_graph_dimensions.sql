-- Normalized dimensions for the production Crypto Developer Knowledge Graph.
-- The wide arrays in 001 remain import-friendly compatibility fields; these
-- tables are the canonical query surface for Supabase APIs and IDE/CLI tools.

create table if not exists node_tags (
  node_id text not null references nodes(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  primary key (node_id, tag),
  constraint node_tags_non_empty check (length(trim(tag)) > 0)
);

create table if not exists node_contexts (
  node_id text not null references nodes(id) on delete cascade,
  context text not null,
  created_at timestamptz not null default now(),
  primary key (node_id, context),
  constraint node_contexts_non_empty check (length(trim(context)) > 0)
);

create table if not exists node_layers (
  node_id text not null references nodes(id) on delete cascade,
  layer text not null,
  created_at timestamptz not null default now(),
  primary key (node_id, layer),
  constraint node_layers_non_empty check (length(trim(layer)) > 0)
);

create table if not exists node_sources (
  node_id text not null references nodes(id) on delete cascade,
  source_id text not null,
  claim text,
  chunk_id text not null references document_chunks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (node_id, source_id, chunk_id),
  constraint node_sources_non_empty check (length(trim(source_id)) > 0)
);

create table if not exists node_aliases (
  node_id text not null references nodes(id) on delete cascade,
  alias text not null,
  kind text not null default 'search',
  created_at timestamptz not null default now(),
  primary key (node_id, alias),
  constraint node_aliases_kind check (kind in ('label', 'id', 'tag', 'legacy_type', 'search')),
  constraint node_aliases_non_empty check (length(trim(alias)) > 0)
);

create table if not exists code_snippet_sources (
  snippet_id text not null references code_snippets(id) on delete cascade,
  source_id text not null,
  created_at timestamptz not null default now(),
  primary key (snippet_id, source_id),
  constraint code_snippet_sources_non_empty check (length(trim(source_id)) > 0)
);

create table if not exists code_snippet_package_hints (
  snippet_id text not null references code_snippets(id) on delete cascade,
  package_hint text not null,
  created_at timestamptz not null default now(),
  primary key (snippet_id, package_hint),
  constraint code_snippet_package_hints_non_empty check (length(trim(package_hint)) > 0)
);

create table if not exists code_snippet_security_notes (
  snippet_id text not null references code_snippets(id) on delete cascade,
  ordinal integer not null,
  security_note text not null,
  created_at timestamptz not null default now(),
  primary key (snippet_id, ordinal),
  constraint code_snippet_security_notes_positive_ordinal check (ordinal > 0),
  constraint code_snippet_security_notes_non_empty check (length(trim(security_note)) > 0)
);

create table if not exists document_chunk_nodes (
  chunk_id text not null references document_chunks(id) on delete cascade,
  node_id text not null references nodes(id) on delete cascade,
  source_id text not null,
  claim text,
  status text not null default 'seeded',
  created_at timestamptz not null default now(),
  primary key (chunk_id, node_id),
  constraint document_chunk_nodes_status check (status in ('seeded', 'verified', 'stale', 'retracted'))
);

create table if not exists live_metadata_target_sources (
  target_id text not null references live_metadata_targets(id) on delete cascade,
  source_id text not null,
  created_at timestamptz not null default now(),
  primary key (target_id, source_id),
  constraint live_metadata_target_sources_non_empty check (length(trim(source_id)) > 0)
);

create table if not exists contract_abi_items (
  id uuid primary key default gen_random_uuid(),
  target_id text not null references live_metadata_targets(id) on delete cascade,
  node_id text not null references nodes(id) on delete cascade,
  network text not null,
  contract_address text,
  item_type text not null,
  name text,
  signature text,
  selector text,
  inputs jsonb not null default '[]'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  state_mutability text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_abi_items_inputs_array check (jsonb_typeof(inputs) = 'array'),
  constraint contract_abi_items_outputs_array check (jsonb_typeof(outputs) = 'array'),
  constraint contract_abi_items_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists runtime_metadata_observations (
  id uuid primary key default gen_random_uuid(),
  target_id text not null references live_metadata_targets(id) on delete cascade,
  node_id text not null references nodes(id) on delete cascade,
  network text not null,
  runtime text,
  serialization text,
  spec_version bigint,
  transaction_version bigint,
  metadata_hash text,
  observed_at timestamptz,
  source_rpc_method text,
  verification text not null default 'unverified',
  raw_digest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint runtime_metadata_observations_verification check (verification in ('verified', 'unverified', 'failed')),
  constraint runtime_metadata_observations_raw_digest_object check (jsonb_typeof(raw_digest) = 'object')
);

create table if not exists node_runtime_dependencies (
  node_id text not null references nodes(id) on delete cascade,
  target_id text not null references live_metadata_targets(id) on delete cascade,
  dependency_kind text not null,
  tracked_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (node_id, target_id, dependency_kind),
  constraint node_runtime_dependencies_kind check (dependency_kind in ('registry_track', 'contract_abi', 'network_parameter'))
);

create index if not exists node_tags_tag_idx on node_tags(tag);
create index if not exists node_contexts_context_idx on node_contexts(context);
create index if not exists node_layers_layer_idx on node_layers(layer);
create index if not exists node_sources_source_idx on node_sources(source_id);
create index if not exists node_sources_chunk_idx on node_sources(chunk_id);
create index if not exists node_aliases_alias_idx on node_aliases(alias);

create index if not exists code_snippet_sources_source_idx on code_snippet_sources(source_id);
create index if not exists code_snippet_package_hints_hint_idx on code_snippet_package_hints(package_hint);

create index if not exists document_chunk_nodes_node_idx on document_chunk_nodes(node_id);
create index if not exists document_chunk_nodes_source_idx on document_chunk_nodes(source_id);

create index if not exists live_metadata_target_sources_source_idx on live_metadata_target_sources(source_id);
create index if not exists contract_abi_items_node_idx on contract_abi_items(node_id);
create index if not exists contract_abi_items_selector_idx on contract_abi_items(selector);
create unique index if not exists contract_abi_items_target_signature_selector_idx
  on contract_abi_items(target_id, coalesce(signature, ''), coalesce(selector, ''));
create index if not exists contract_abi_items_inputs_idx on contract_abi_items using gin(inputs jsonb_path_ops);
create index if not exists runtime_metadata_observations_node_idx on runtime_metadata_observations(node_id);
create index if not exists runtime_metadata_observations_target_idx on runtime_metadata_observations(target_id);
create index if not exists runtime_metadata_observations_observed_idx on runtime_metadata_observations(observed_at desc);

drop trigger if exists contract_abi_items_set_updated_at on contract_abi_items;
create trigger contract_abi_items_set_updated_at
before update on contract_abi_items
for each row execute function set_updated_at();

drop trigger if exists runtime_metadata_observations_set_updated_at on runtime_metadata_observations;
create trigger runtime_metadata_observations_set_updated_at
before update on runtime_metadata_observations
for each row execute function set_updated_at();

create or replace view node_semantic_documents as
select
  n.id,
  n.kind,
  n.label,
  n.summary,
  n.theoretical_documentation,
  coalesce(array_agg(distinct nt.tag) filter (where nt.tag is not null), '{}') as tags,
  coalesce(array_agg(distinct nc.context) filter (where nc.context is not null), '{}') as contexts,
  coalesce(array_agg(distinct nl.layer) filter (where nl.layer is not null), '{}') as layers,
  coalesce(array_agg(distinct ns.source_id) filter (where ns.source_id is not null), '{}') as source_ids,
  concat_ws(
    E'\n',
    n.label,
    n.kind::text,
    n.summary,
    n.theoretical_documentation,
    'tags: ' || coalesce(string_agg(distinct nt.tag, ', '), ''),
    'contexts: ' || coalesce(string_agg(distinct nc.context, ', '), ''),
    'layers: ' || coalesce(string_agg(distinct nl.layer, ', '), '')
  ) as semantic_text
from nodes n
left join node_tags nt on nt.node_id = n.id
left join node_contexts nc on nc.node_id = n.id
left join node_layers nl on nl.node_id = n.id
left join node_sources ns on ns.node_id = n.id
group by n.id;

comment on table node_tags is 'Normalized node tag dimension for filtering and graph horizon narrowing.';
comment on table node_contexts is 'Normalized node context dimension, such as wallet, signing, indexing, or staking.';
comment on table node_layers is 'Normalized architecture layer dimension, such as primitive, protocol, runtime, application, or infrastructure.';
comment on table node_sources is 'Normalized source-to-node claims; ties citations and chunks directly to graph entities.';
comment on table node_aliases is 'Search aliases for labels, ids, tags, and legacy graph type names.';
comment on table document_chunk_nodes is 'Many-to-many grounding between document chunks and nodes for citation-aware RAG.';
comment on table contract_abi_items is 'Exploded contract ABI functions/events/errors bound to live metadata targets.';
comment on table runtime_metadata_observations is 'Observed runtime/registry snapshots used to detect byte-structure changes over time.';
comment on table node_runtime_dependencies is 'Node-to-live-target dependencies for RPC-backed verification and stale-claim detection.';
comment on view node_semantic_documents is 'Normalized retrieval document assembled from node text and dimensions before embedding.';
