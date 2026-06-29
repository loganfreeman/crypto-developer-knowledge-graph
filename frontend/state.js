export const state = {
  nodes: [],
  relationships: [],
  goals: [],
  citations: [],
  chunks: [],
  sources: [],
  trust: { nodes: [], sources: [], summary: {} },
  networkConditions: { conditions: [] },
  liveMetadata: { targets: [] },
  serializationSandboxes: { sandboxes: [] },
  operationalPlaybooks: { playbooks: [] },
  selectedGoalId: "build-offline-signer",
  selectedNodeId: null,
  activeEdgeTypes: [],
  activeLayer: "all",
  activeTab: "docs",
  graphZoom: 1,
  traceBuilder: {
    prompt: "",
    result: null,
    loading: false,
    error: "",
  },
};

export const primaryEdgeTypes = [
  "REQUIRES",
  "DEPENDS_ON",
  "IMPLEMENTED_BY",
  "USES_TEMPLATE",
  "SERIALIZES_AS",
  "HASHES_TO",
  "CAN_USE_SIGNER",
  "HAS_GUARDRAIL",
  "FAILS_WITH",
  "DEBUGGED_BY",
  "MEASURED_BY",
  "HAS_LIVE_CONDITION",
  "CALLS",
  "VERIFIES_WITH",
  "ENABLES",
  "RUNS_ON",
];

export const sidecarTabs = [
  ["trace", "Trace Builder"],
  ["docs", "Documentation"],
  ["code", "Code Snippets"],
  ["ops", "Failures"],
  ["state", "State"],
  ["sandbox", "Sandbox"],
  ["risks", "Risks"],
  ["sources", "Sources"],
];

let renderApp = () => {};

export function setRenderCallback(callback) {
  renderApp = callback;
}

export function rerender() {
  renderApp();
}

export function byId(items) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function nodeMap() {
  return byId(state.nodes);
}

export function nodeLabel(nodeId) {
  return nodeMap()[nodeId]?.label || nodeId;
}

export function trustForNode(nodeId) {
  return state.trust.nodes.find((item) => item.id === nodeId) || { status: "unknown", staleness_risk: "unknown", citation_count: 0 };
}

export function trustLabel(status) {
  return {
    verified: "Verified",
    seeded: "Seeded",
    needs_citation: "Needs citation",
    source_attention: "Source attention",
    unknown: "Unknown",
  }[status] || status;
}

export function networkConditionsForNode(nodeId) {
  return (state.networkConditions.conditions || []).filter((item) => item.node_id === nodeId);
}

export function liveMetadataForNode(nodeId) {
  return (state.liveMetadata.targets || []).filter((item) => item.node_id === nodeId);
}

export function serializationSandboxesForNode(nodeId) {
  return (state.serializationSandboxes.sandboxes || []).filter((item) => item.node_id === nodeId);
}

export function operationalPlaybooksForNode(nodeId) {
  return (state.operationalPlaybooks.playbooks || []).filter((item) => (item.related_nodes || []).includes(nodeId));
}

export function nodeSearchText(node) {
  return [
    node.id,
    node.label,
    node.type,
    node.summary,
    ...(node.tags || []),
    ...(node.contexts || []),
    ...(node.layers || []),
  ].join(" ").toLowerCase();
}

export function nodeMatches(node, tokens) {
  const text = nodeSearchText(node);
  return tokens.some((token) => text.includes(token));
}

export function nodeLayers(node) {
  return node.layers || [node.type];
}

export function availableLayers() {
  const layers = new Set();
  state.nodes.forEach((node) => nodeLayers(node).forEach((layer) => layers.add(layer)));
  return ["all", ...[...layers].sort()];
}

export function edgeAllowed(edge) {
  return !state.activeEdgeTypes.length || state.activeEdgeTypes.includes(edge.type);
}

export function nodeAllowedByLayer(node) {
  return state.activeLayer === "all" || nodeLayers(node).includes(state.activeLayer);
}

export function selectedGoal() {
  return state.goals.find((goal) => goal.id === state.selectedGoalId) || state.goals[0];
}

export function goalNodeIds(goal) {
  return new Set([
    goal.task_node_id,
    ...goal.concepts,
    ...goal.apis,
    ...goal.code_examples,
    ...goal.security_warnings,
    ...goal.supported_chains,
  ]);
}

export function traceHighlightIds() {
  return new Set(state.traceBuilder.result?.highlightedNodeIds || []);
}

export function focusedHorizon(goal) {
  const map = nodeMap();
  const focus = state.selectedNodeId || goal.task_node_id;
  const base = goalNodeIds(goal);
  const highlighted = traceHighlightIds();
  const edges = state.relationships.filter((edge) => {
    if (!edgeAllowed(edge)) return false;
    return edge.source === focus || edge.target === focus || (base.has(edge.source) && base.has(edge.target)) || (highlighted.has(edge.source) && highlighted.has(edge.target));
  });
  const selected = new Set([focus, ...base, ...highlighted]);
  edges.forEach((edge) => {
    selected.add(edge.source);
    selected.add(edge.target);
  });
  const nodes = [...selected].map((id) => map[id]).filter(Boolean).filter(nodeAllowedByLayer);
  const visibleIds = new Set(nodes.map((node) => node.id));
  return {
    focus,
    nodes,
    relationships: edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
  };
}

export function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  rerender();
}
