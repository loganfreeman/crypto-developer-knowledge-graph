async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json();
}

export async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.error || `Failed to post ${path}`);
  return body;
}

export async function loadGraphData() {
  const graph = await loadJson("/api/graph");
  return {
    nodes: graph.nodes,
    relationships: graph.relationships,
    goals: graph.goals,
    citations: graph.citations,
    chunks: graph.chunks,
    sources: graph.sources,
    trust: graph.trust,
    networkConditions: graph.network_conditions,
    liveMetadata: graph.live_metadata,
    serializationSandboxes: graph.serialization_sandboxes,
    operationalPlaybooks: graph.operational_playbooks,
  };
}
