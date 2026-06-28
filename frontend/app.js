import { analyzeSerializationPayload } from "./serialization_sandbox.js";

const state = {
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
  selectedGoalId: "build-offline-signer",
  selectedNodeId: null,
  activeEdgeTypes: [],
  activeLayer: "all",
  activeTab: "docs",
  assistant: {
    prompt: "",
    result: null,
  },
};

const primaryEdgeTypes = [
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

const sidecarTabs = [
  ["assistant", "Assistant"],
  ["docs", "Documentation"],
  ["code", "Code Snippets"],
  ["state", "State"],
  ["sandbox", "Sandbox"],
  ["risks", "Risks"],
  ["sources", "Sources"],
];

const assistantBlueprints = [
  {
    id: "go-turnkey-concurrent-signer",
    title: "Go concurrent transaction signer with Turnkey",
    matchTokens: ["go", "golang", "concurrent", "matching", "engine", "turnkey", "sign", "transactions", "non-custodial"],
    goalId: "build-offline-signer",
    focusNodeId: "offline-transaction-signer",
    highlightedNodeIds: [
      "offline-transaction-signer",
      "transaction-creation",
      "deterministic-serialization",
      "payload-signing",
      "turnkey-raw-payload-signing-pattern",
      "signing-byte-boundary-guardrail",
      "replay-domain-guardrail",
      "eth-send-raw-transaction",
    ],
    architecturalSteps: [
      "Treat the matching engine as the off-graph service layer: it receives fills/orders, assigns idempotency keys, and pushes signing jobs to bounded Go worker pools.",
      "Build canonical unsigned transactions before workers touch Turnkey, then freeze every field that affects the signing preimage.",
      "Serialize with the chain codec, hash only at the documented boundary, and persist a hex dump of raw bytes plus request metadata for audit replay.",
      "Call Turnkey sign_raw_payload from each worker with explicit payload encoding, hash mode, organization policy, and signer identity.",
      "Normalize the returned signature into the target chain envelope, then broadcast through the chain RPC and track nonce or sequence conflicts.",
      "Put replay-domain and byte-boundary guardrails in the queue contract so a concurrent retry cannot sign a different payload under the same business id.",
    ],
    caveats: [
      "No dedicated matching-engine node exists yet; the assistant maps that phrase to a backend orchestration layer.",
      "Turnkey, serialization, and broadcast code examples live in the Code Snippets tab for the highlighted nodes.",
    ],
  },
];

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json();
}

async function loadGraphData() {
  try {
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
    };
  } catch (error) {
    const [nodes, relationships, goals, citations, chunks, sources, trust, networkConditions, liveMetadata, serializationSandboxes] = await Promise.all([
      loadJson("../data/nodes.json"),
      loadJson("../data/relationships.json"),
      loadJson("../data/goal_paths.json"),
      loadJson("../data/citations.json"),
      loadJson("../data/chunks.json"),
      loadJson("../data/sources.json"),
      loadJson("../data/trust_report.json"),
      loadJson("../data/network_conditions.json"),
      loadJson("../data/live_metadata.json"),
      loadJson("../data/serialization_sandboxes.json"),
    ]);
    return { nodes, relationships, goals, citations, chunks, sources, trust, networkConditions, liveMetadata, serializationSandboxes };
  }
}

function byId(items) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function nodeMap() {
  return byId(state.nodes);
}

function nodeLabel(nodeId) {
  return nodeMap()[nodeId]?.label || nodeId;
}

function trustForNode(nodeId) {
  return state.trust.nodes.find((item) => item.id === nodeId) || { status: "unknown", staleness_risk: "unknown", citation_count: 0 };
}

function trustLabel(status) {
  return {
    verified: "Verified",
    seeded: "Seeded",
    needs_citation: "Needs citation",
    source_attention: "Source attention",
    unknown: "Unknown",
  }[status] || status;
}

function networkConditionsForNode(nodeId) {
  return (state.networkConditions.conditions || []).filter((item) => item.node_id === nodeId);
}

function liveMetadataForNode(nodeId) {
  return (state.liveMetadata.targets || []).filter((item) => item.node_id === nodeId);
}

function serializationSandboxesForNode(nodeId) {
  return (state.serializationSandboxes.sandboxes || []).filter((item) => item.node_id === nodeId);
}

function nodeSearchText(node) {
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

function nodeMatches(node, tokens) {
  const text = nodeSearchText(node);
  return tokens.some((token) => text.includes(token));
}

function nodeLayers(node) {
  return node.layers || [node.type];
}

function availableLayers() {
  const layers = new Set();
  state.nodes.forEach((node) => nodeLayers(node).forEach((layer) => layers.add(layer)));
  return ["all", ...[...layers].sort()];
}

function edgeAllowed(edge) {
  return !state.activeEdgeTypes.length || state.activeEdgeTypes.includes(edge.type);
}

function nodeAllowedByLayer(node) {
  return state.activeLayer === "all" || nodeLayers(node).includes(state.activeLayer);
}

function selectedGoal() {
  return state.goals.find((goal) => goal.id === state.selectedGoalId) || state.goals[0];
}

function goalNodeIds(goal) {
  return new Set([
    goal.task_node_id,
    ...goal.concepts,
    ...goal.apis,
    ...goal.code_examples,
    ...goal.security_warnings,
    ...goal.supported_chains,
  ]);
}

function assistantHighlightIds() {
  return new Set(state.assistant.result?.highlightedNodeIds || []);
}

function focusedHorizon(goal) {
  const map = nodeMap();
  const focus = state.selectedNodeId || goal.task_node_id;
  const base = goalNodeIds(goal);
  const highlighted = assistantHighlightIds();
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

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  render();
}

function scorePromptAgainstBlueprint(query, blueprint) {
  const q = query.toLowerCase();
  return blueprint.matchTokens.reduce((score, token) => score + (q.includes(token) ? 1 : 0), 0);
}

function topNodesForPrompt(query) {
  const q = query.toLowerCase();
  return state.nodes
    .map((node) => {
      const score = q.split(/\s+/).filter((token) => token.length > 2 && nodeSearchText(node).includes(token)).length;
      return { node, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .map((item) => item.node.id);
}

function buildAssistantFallback(query) {
  const highlightedNodeIds = topNodesForPrompt(query);
  const focusNodeId = highlightedNodeIds[0] || selectedGoal().task_node_id;
  return {
    id: "semantic-local-search",
    title: "Local graph retrieval path",
    prompt: query,
    goalId: state.selectedGoalId,
    focusNodeId,
    highlightedNodeIds,
    architecturalSteps: highlightedNodeIds.length
      ? highlightedNodeIds.map((id) => `Inspect ${nodeLabel(id)} and follow its adjacent relationships for implementation constraints.`)
      : ["No strong node match was found. Try naming a protocol, runtime, serialization format, signing provider, or build goal."],
    caveats: ["This local assistant uses graph metadata only; plug a server-side RAG model into the same path contract for synthesized answers."],
  };
}

function runAssistantPrompt(query) {
  const prompt = query.trim();
  if (!prompt) return;
  const ranked = assistantBlueprints
    .map((blueprint) => ({ blueprint, score: scorePromptAgainstBlueprint(prompt, blueprint) }))
    .sort((a, b) => b.score - a.score);
  const result = ranked[0]?.score >= 2
    ? { ...ranked[0].blueprint, prompt }
    : buildAssistantFallback(prompt);
  state.assistant = { prompt, result };
  state.selectedGoalId = result.goalId || state.selectedGoalId;
  state.selectedNodeId = result.focusNodeId || result.highlightedNodeIds[0] || state.selectedNodeId;
  state.activeLayer = "all";
  state.activeEdgeTypes = [];
  state.activeTab = "assistant";
  render();
}

function renderGoals() {
  const nav = document.querySelector("#goals");
  nav.innerHTML = "";
  state.goals.forEach((goal) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = goal.title;
    button.setAttribute("aria-current", String(goal.id === state.selectedGoalId));
    button.addEventListener("click", () => {
      state.selectedGoalId = goal.id;
      state.selectedNodeId = goal.task_node_id;
      state.activeTab = "docs";
      render();
    });
    nav.appendChild(button);
  });
}

function renderSummary(goal) {
  const map = nodeMap();
  const task = map[goal.task_node_id];
  document.querySelector("#title").textContent = goal.title;
  document.querySelector("#summary").innerHTML = `
    <div>
      <p class="eyebrow">Current intent</p>
      <h2>${escapeHtml(task.label)}</h2>
      <p>${escapeHtml(task.summary)}</p>
    </div>
    <div class="intent-metrics">
      <span>${state.trust.summary.uncited_production_nodes || 0} uncited production nodes</span>
      <span>${state.trust.summary.stale_sources || 0} stale sources</span>
      <span>${goal.example_flow.length} execution steps</span>
    </div>
  `;
}

function renderAssistantBridge() {
  const input = document.querySelector("#assistant-prompt");
  if (input && document.activeElement !== input) input.value = state.assistant.prompt || "";
}

function renderControls() {
  const controls = document.querySelector("#graph-controls");
  const layerButtons = availableLayers()
    .map((layer) => `<button type="button" class="filter ${state.activeLayer === layer ? "active" : ""}" data-layer="${layer}">${escapeHtml(layer)}</button>`)
    .join("");
  const edgeButtons = primaryEdgeTypes
    .map((type) => {
      const active = !state.activeEdgeTypes.length || state.activeEdgeTypes.includes(type);
      return `<button type="button" class="filter ${active ? "active" : ""}" data-edge-type="${type}">${escapeHtml(type)}</button>`;
    })
    .join("");
  controls.innerHTML = `
    <details open>
      <summary>Layer</summary>
      <div class="filter-row">${layerButtons}</div>
    </details>
    <details>
      <summary>Relationship filters</summary>
      <div class="filter-row">${edgeButtons}</div>
    </details>
  `;
  controls.querySelectorAll("[data-layer]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeLayer = button.dataset.layer;
      render();
    });
  });
  controls.querySelectorAll("[data-edge-type]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.edgeType;
      if (!state.activeEdgeTypes.length) {
        state.activeEdgeTypes = primaryEdgeTypes.filter((item) => item !== type);
      } else if (state.activeEdgeTypes.includes(type)) {
        state.activeEdgeTypes = state.activeEdgeTypes.filter((item) => item !== type);
      } else {
        state.activeEdgeTypes = [...state.activeEdgeTypes, type];
      }
      if (state.activeEdgeTypes.length === primaryEdgeTypes.length) state.activeEdgeTypes = [];
      render();
    });
  });
}

function coordinatesFor(nodes, focusId) {
  const width = 860;
  const height = 540;
  const center = { x: width / 2, y: height / 2 };
  const peers = nodes.filter((node) => node.id !== focusId);
  const coords = { [focusId]: center };
  peers.forEach((node, index) => {
    const ring = index < 8 ? 170 : 250;
    const angle = (Math.PI * 2 * index) / Math.max(peers.length, 1) - Math.PI / 2;
    coords[node.id] = {
      x: center.x + Math.cos(angle) * ring,
      y: center.y + Math.sin(angle) * ring,
    };
  });
  return { coords, width, height };
}

function relationCaption(edge, focusId) {
  const other = edge.source === focusId ? edge.target : edge.source;
  const prefix = edge.source === focusId ? edge.type : `IN_${edge.type}`;
  return `${prefix} ${nodeLabel(other)}`;
}

function renderGraph(goal) {
  renderControls();
  state.selectedNodeId = state.selectedNodeId || goal.task_node_id;
  const highlighted = assistantHighlightIds();
  const { focus, nodes, relationships } = focusedHorizon(goal);
  const { coords, width, height } = coordinatesFor(nodes, focus);
  document.querySelector("#counts").textContent = `${nodes.length} nodes / ${relationships.length} edges`;

  const lines = relationships
    .filter((edge) => coords[edge.source] && coords[edge.target])
    .map((edge) => {
      const source = coords[edge.source];
      const target = coords[edge.target];
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const highlightedEdge = highlighted.has(edge.source) && highlighted.has(edge.target);
      return `
        <line class="graph-edge ${highlightedEdge ? "assistant-highlight" : ""}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"></line>
        <text class="edge-label ${highlightedEdge ? "assistant-highlight" : ""}" x="${midX}" y="${midY}">${escapeHtml(edge.type)}</text>
      `;
    })
    .join("");

  const nodeButtons = nodes
    .map((node) => {
      const point = coords[node.id];
      const trust = trustForNode(node.id);
      const relations = relationships.filter((edge) => edge.source === node.id || edge.target === node.id);
      return `
        <button
          class="canvas-node ${node.id === focus ? "selected" : ""} ${highlighted.has(node.id) ? "assistant-highlight" : ""}"
          type="button"
          data-node-id="${node.id}"
          style="left:${point.x}px;top:${point.y}px"
        >
          <span class="type">${escapeHtml(node.type)}</span>
          <strong>${escapeHtml(node.label)}</strong>
          <small>${escapeHtml(node.display_group || nodeLayers(node)[0])}</small>
          <span class="trust-dot ${trust.status}" title="${escapeHtml(trustLabel(trust.status))}"></span>
          ${relations.slice(0, 2).map((edge) => `<em>${escapeHtml(relationCaption(edge, node.id))}</em>`).join("")}
        </button>
      `;
    })
    .join("");

  document.querySelector("#graph").innerHTML = `
    <svg class="edge-canvas" viewBox="0 0 ${width} ${height}" aria-hidden="true">${lines}</svg>
    <div class="node-layer">${nodeButtons}</div>
  `;
  document.querySelectorAll(".canvas-node[data-node-id]").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.nodeId));
  });
}

function renderSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    render();
    return;
  }
  const result = state.nodes.find((node) => {
    const text = `${node.id} ${node.label} ${node.type} ${node.summary} ${(node.tags || []).join(" ")} ${(node.contexts || []).join(" ")}`.toLowerCase();
    return text.includes(q);
  });
  if (result) {
    state.selectedNodeId = result.id;
    render();
  }
}

function relationshipRows(nodeId, predicate = () => true) {
  return state.relationships
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .filter(edgeAllowed)
    .filter(predicate)
    .map((edge) => {
      const outward = edge.source === nodeId;
      const peer = outward ? edge.target : edge.source;
      return `
        <button class="edge" type="button" data-node-id="${peer}">
          <span>${outward ? edge.type : "IN_" + edge.type}</span>
          <strong>${escapeHtml(nodeLabel(peer))}</strong>
          ${edge.context || edge.layer || edge.developer_note ? `<small>${escapeHtml([edge.context, edge.layer, edge.confidence].filter(Boolean).join(" / "))}${edge.developer_note ? `<br>${escapeHtml(edge.developer_note)}` : ""}</small>` : ""}
        </button>
      `;
    })
    .join("");
}

function citationRows(nodeId) {
  const sourceMap = byId(state.sources);
  const chunkMap = byId(state.chunks);
  const rows = state.citations.filter((citation) => citation.node_id === nodeId);
  if (!rows.length) return `<p class="muted">No citation has been attached yet.</p>`;
  return rows
    .map((citation) => {
      const source = sourceMap[citation.source_id];
      const chunk = chunkMap[citation.chunk_id];
      return `
        <article class="citation">
          <a href="${escapeHtml(citation.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(source?.title || citation.source_id)}</a>
          <p>${escapeHtml(citation.claim)}</p>
          ${chunk ? `<blockquote>${escapeHtml(chunk.text)}</blockquote>` : ""}
        </article>
      `;
    })
    .join("");
}

function networkConditionRows(nodeId) {
  const conditions = networkConditionsForNode(nodeId);
  if (!conditions.length) return `<p class="muted">No live network conditions attached to this node.</p>`;
  return conditions
    .map((condition) => `
      <article class="network-condition">
        <div class="network-condition-head">
          <strong>${escapeHtml(condition.network)}</strong>
          <span class="${escapeHtml(condition.status)}">${escapeHtml(condition.status)}</span>
        </div>
        <p>${escapeHtml(condition.provider_id)} · ${escapeHtml(condition.freshness_policy)} · ${escapeHtml(condition.last_updated_at)}</p>
        <div class="parameter-list">
          ${condition.parameters.map((param) => `
            <div class="parameter">
              <strong>${escapeHtml(param.label)}</strong>
              <span>${param.value === null ? "Query live" : escapeHtml(param.value)} ${escapeHtml(param.unit || "")}</span>
              <code>${escapeHtml(param.query)}</code>
              <p>${escapeHtml(param.developer_note || "")}</p>
            </div>
          `).join("")}
        </div>
      </article>
    `)
    .join("");
}

function liveMetadataRows(nodeId) {
  const targets = liveMetadataForNode(nodeId);
  if (!targets.length) return `<p class="muted">No live registry or ABI verification target is attached to this node.</p>`;
  return targets
    .map((target) => `
      <article class="network-condition">
        <div class="network-condition-head">
          <strong>${escapeHtml(target.network)} · ${escapeHtml(target.kind)}</strong>
          <span class="${escapeHtml(target.status)}">${escapeHtml(target.status)}</span>
        </div>
        <p>${escapeHtml(target.provider_id)} · ${escapeHtml(target.freshness_policy)} · ${escapeHtml(target.last_checked_at || "not checked")}</p>
        ${target.contract_address ? `<p><code>${escapeHtml(target.contract_address)}</code></p>` : ""}
        <div class="parameter-list">
          ${(target.checks || []).map((check) => `
            <div class="parameter">
              <strong>${escapeHtml(check.label)}</strong>
              <span>${escapeHtml(check.verification || "unverified")}</span>
              <code>${escapeHtml(check.rpc_method || "local")}</code>
              <p>${escapeHtml(check.developer_note || "")}</p>
            </div>
          `).join("")}
        </div>
      </article>
    `)
    .join("");
}

function codePanel(node) {
  const relatedCode = state.relationships
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .map((edge) => nodeMap()[edge.source === node.id ? edge.target : edge.source])
    .filter((item) => item && (item.code || item.multi_language_examples));
  const items = [node, ...relatedCode].filter((item) => item.code || item.multi_language_examples);
  const snippets = items.flatMap((item) => {
    const examples = item.multi_language_examples || [];
    const base = item.code ? [{
      language: item.language || "text",
      title: item.label,
      summary: item.summary,
      code: item.code,
    }] : [];
    return [...base, ...examples.map((example) => ({
      language: example.language,
      title: example.title || item.label,
      summary: example.summary || item.summary,
      code: example.code,
    }))];
  });
  if (!snippets.length) return `<p class="muted">No code or payload template attached yet.</p>`;
  return snippets
    .map((item) => `
      <article class="code-card">
        <div class="code-card-head">
          <h3>${escapeHtml(item.title)}</h3>
          <span>${escapeHtml(item.language)}</span>
        </div>
        <p>${escapeHtml(item.summary)}</p>
        <pre><code>${escapeHtml(item.code)}</code></pre>
      </article>
    `)
    .join("");
}

function docsPanel(node) {
  const trust = trustForNode(node.id);
  return `
    <section class="doc-block">
      <p>${escapeHtml(node.summary)}</p>
      <div class="meta-grid">
        <div>
          <h3>Layers</h3>
          <div class="tag-list">${nodeLayers(node).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
        </div>
        <div>
          <h3>Contexts</h3>
          <div class="tag-list">${(node.contexts || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("") || `<p class="muted">No contexts yet.</p>`}</div>
        </div>
      </div>
      <div class="trust-panel">
        <strong>Trust</strong>
        <span>Status: ${escapeHtml(trustLabel(trust.status))}</span>
        <span>Citations: ${escapeHtml(trust.citation_count)}</span>
        <span>Staleness risk: ${escapeHtml(trust.staleness_risk)}</span>
      </div>
    </section>
    ${node.implementation_notes ? `
      <section class="detail-section">
        <h3>Implementation Notes</h3>
        <ul class="note-list">${node.implementation_notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
      </section>
    ` : ""}
    <section class="detail-section">
      <h3>Relationship Blueprint</h3>
      <div class="edge-list">${relationshipRows(node.id) || `<p class="muted">No relationships yet.</p>`}</div>
    </section>
  `;
}

function risksPanel(node) {
  const rows = relationshipRows(node.id, (edge) => edge.type.includes("RISK") || edge.type.includes("GUARDRAIL") || edge.type === "FAILS_WITH" || edge.type === "DEBUGGED_BY");
  return rows ? `<div class="edge-list">${rows}</div>` : `<p class="muted">No explicit risks or guardrails attached yet.</p>`;
}

function statePanel(node) {
  return `
    <section class="detail-section">
      <h3>Live Registry And ABI Verification</h3>
      ${liveMetadataRows(node.id)}
    </section>
    <section class="detail-section">
      <h3>Network Conditions</h3>
      ${networkConditionRows(node.id)}
    </section>
  `;
}

function sourcesPanel(node) {
  return citationRows(node.id);
}

function assistantPanel() {
  const result = state.assistant.result;
  if (!result) {
    return `
      <section class="assistant-answer">
        <p class="muted">Ask the Copilot Bridge to trace an implementation path. The answer will highlight graph nodes and render architectural steps here.</p>
      </section>
    `;
  }
  return `
    <section class="assistant-answer">
      <p class="eyebrow">Prompt</p>
      <blockquote>${escapeHtml(result.prompt)}</blockquote>
      <h3>${escapeHtml(result.title)}</h3>
      <div class="assistant-path">
        ${result.highlightedNodeIds.map((id) => `
          <button type="button" class="path-node" data-node-id="${id}">
            <span>${escapeHtml(nodeMap()[id]?.type || "Node")}</span>
            <strong>${escapeHtml(nodeLabel(id))}</strong>
          </button>
        `).join("")}
      </div>
      <div class="detail-section">
        <h3>Architecture Steps</h3>
        <ol class="step-list">${result.architecturalSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      </div>
      <div class="detail-section">
        <h3>Grounding Notes</h3>
        <ul class="note-list">${result.caveats.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
      </div>
    </section>
  `;
}

function hasCryptoSandbox(node) {
  return nodeMatches(node, [
    "hash",
    "signature",
    "signing",
    "signer",
    "kms",
    "payload",
    "serialization",
    "rlp",
    "scale",
    "cbor",
    "secp256k1",
    "ed25519",
    "bad-signature",
  ]);
}

function hasStakingSandbox(node) {
  return nodeMatches(node, ["staking", "stake", "validator", "nomination", "delegation", "bond"]);
}

function hashSandboxMarkup() {
  return `
    <article class="sandbox-widget" data-sandbox="hash">
      <div>
        <p class="eyebrow">Byte calculator</p>
        <h3>Hash Raw Payload</h3>
        <p class="muted">Use this to check the exact bytes before a signing or serialization step.</p>
      </div>
      <label class="sandbox-control">
        Raw string
        <textarea id="hash-input" rows="4" spellcheck="false">staking.nominate</textarea>
      </label>
      <label class="sandbox-control">
        Algorithm
        <select id="hash-algorithm">
          <option value="SHA-256">SHA-256</option>
          <option value="Keccak-256">Keccak-256</option>
          <option value="BLAKE2b-256">BLAKE2b-256</option>
        </select>
      </label>
      <div class="sandbox-output">
        <span id="hash-status">Waiting for input.</span>
        <code id="hash-output"></code>
      </div>
      <p class="warning-note">Keccak-256 and BLAKE2b need a vetted implementation; this sandbox will not substitute SHA3 or a toy hash.</p>
    </article>
  `;
}

function stakingSandboxMarkup(node) {
  const conditions = networkConditionsForNode(node.id);
  const networkLine = conditions.length
    ? conditions.map((condition) => `${condition.network}: ${condition.status}, ${condition.freshness_policy}`).join(" · ")
    : "No cached live-state feed is attached yet.";
  return `
    <article class="sandbox-widget" data-sandbox="staking">
      <div>
        <p class="eyebrow">State model</p>
        <h3>Staking Reward Scenario</h3>
        <p class="muted">${escapeHtml(networkLine)}</p>
      </div>
      <label class="sandbox-control">
        Bonded amount
        <div class="range-row">
          <input id="bond-amount" type="range" min="100" max="100000" step="100" value="10000">
          <input id="bond-amount-number" type="number" min="0" step="100" value="10000">
        </div>
      </label>
      <label class="sandbox-control">
        Assumed APR (%)
        <input id="staking-apr" type="number" min="0" max="100" step="0.1" value="8.0">
      </label>
      <label class="sandbox-control">
        Validator commission (%)
        <input id="staking-commission" type="number" min="0" max="100" step="0.1" value="5.0">
      </label>
      <div class="metric-grid">
        <div class="metric"><span>Annual reward</span><strong id="annual-reward">0</strong></div>
        <div class="metric"><span>Monthly reward</span><strong id="monthly-reward">0</strong></div>
        <div class="metric"><span>Daily reward</span><strong id="daily-reward">0</strong></div>
      </div>
      <p class="warning-note">This is a client-side scenario model. Production yields must replace the APR input with the live protocol formula and validator state.</p>
    </article>
  `;
}

function serializationSandboxMarkup(node) {
  return serializationSandboxesForNode(node.id)
    .map((sandbox) => {
      const isTypeAlignment = sandbox.codec === "type-alignment";
      return `
        <article class="sandbox-widget serialization-widget" data-sandbox="serialization" data-sandbox-id="${escapeHtml(sandbox.id)}">
          <div>
            <p class="eyebrow">${isTypeAlignment ? "Type guardrail" : "Deterministic parser"}</p>
            <h3>${escapeHtml(sandbox.title)}</h3>
            <p class="muted">${escapeHtml(sandbox.description)}</p>
          </div>
          ${isTypeAlignment ? `
            <label class="sandbox-control">
              Decimal integer
              <input data-type-decimal value="${escapeHtml(sandbox.sample_value || "")}" inputmode="numeric">
            </label>
            <label class="sandbox-control">
              Hex bytes
              <textarea data-serialization-input rows="5" spellcheck="false">${escapeHtml(sandbox.sample_hex || "")}</textarea>
            </label>
          ` : `
            <label class="sandbox-control">
              Layout
              <select data-serialization-layout>
                ${(sandbox.layouts || []).map((layout) => `<option value="${escapeHtml(layout.id)}">${escapeHtml(layout.label)}</option>`).join("")}
              </select>
            </label>
            <label class="sandbox-control">
              Hex payload
              <textarea data-serialization-input rows="7" spellcheck="false">${escapeHtml(sandbox.sample_hex || "")}</textarea>
            </label>
          `}
          <div class="sandbox-actions">
            <button type="button" data-serialization-run>${isTypeAlignment ? "Check Alignment" : "Decode"}</button>
            <button type="button" data-serialization-sample>Reset Sample</button>
          </div>
          <div class="sandbox-output serialization-output" data-serialization-output>
            <span>${isTypeAlignment ? "Check integer range and endian interpretation across JS, Rust, Go, SCALE, and CBOR." : `Paste hex and decode against ${escapeHtml(sandbox.codec.toUpperCase())} layout constraints.`}</span>
          </div>
          <p class="warning-note">Runtime: ${escapeHtml(sandbox.runtime)}. Compare against a trusted chain SDK after runtime upgrades.</p>
        </article>
      `;
    })
    .join("");
}

function sandboxPanel(node) {
  const widgets = [];
  const serializationMarkup = serializationSandboxMarkup(node);
  if (serializationMarkup) widgets.push(serializationMarkup);
  if (hasCryptoSandbox(node)) widgets.push(hashSandboxMarkup(node));
  if (hasStakingSandbox(node)) widgets.push(stakingSandboxMarkup(node));
  if (!widgets.length) {
    return `<p class="muted">No sandbox is attached to this node yet. Select a hashing, signing, serialization, or staking node to use interactive calculators.</p>`;
  }
  return `<div class="sandbox-grid">${widgets.join("")}</div>`;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function updateHashSandbox() {
  const input = document.querySelector("#hash-input");
  const algorithm = document.querySelector("#hash-algorithm");
  const output = document.querySelector("#hash-output");
  const status = document.querySelector("#hash-status");
  if (!input || !algorithm || !output || !status) return;
  const value = input.value || "";
  if (!window.crypto?.subtle) {
    output.textContent = "";
    status.textContent = "WebCrypto is unavailable in this browser context.";
    return;
  }
  if (algorithm.value !== "SHA-256") {
    output.textContent = "";
    status.textContent = `${algorithm.value} is not exposed by native WebCrypto here. Use a vetted library or WASM module for exact output.`;
    return;
  }
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  output.textContent = toHex(digest);
  status.textContent = `SHA-256 over ${new TextEncoder().encode(value).length} UTF-8 bytes.`;
}

function updateStakingSandbox() {
  const range = document.querySelector("#bond-amount");
  const number = document.querySelector("#bond-amount-number");
  const apr = document.querySelector("#staking-apr");
  const commission = document.querySelector("#staking-commission");
  const annual = document.querySelector("#annual-reward");
  const monthly = document.querySelector("#monthly-reward");
  const daily = document.querySelector("#daily-reward");
  if (!range || !number || !apr || !commission || !annual || !monthly || !daily) return;
  const bonded = Math.max(0, Number(number.value || range.value || 0));
  range.value = String(Math.min(Number(range.max), bonded));
  const netApr = Math.max(0, Number(apr.value || 0)) / 100;
  const validatorFee = Math.min(100, Math.max(0, Number(commission.value || 0))) / 100;
  const annualReward = bonded * netApr * (1 - validatorFee);
  const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
  annual.textContent = formatter.format(annualReward);
  monthly.textContent = formatter.format(annualReward / 12);
  daily.textContent = formatter.format(annualReward / 365);
}

function renderSerializationResult(container, result) {
  const diagnostics = result.diagnostics || [];
  container.innerHTML = `
    <div class="parser-summary">
      <span>${escapeHtml(result.layout.label)}</span>
      <span>${escapeHtml(result.byteLength)} bytes</span>
      <span>${escapeHtml(result.wasm.runtime)}</span>
    </div>
    <code>parser ${escapeHtml(result.wasm.fingerprint.slice(0, 16))}</code>
    <div class="parser-diagnostics">
      ${diagnostics.map((item) => `<p class="${escapeHtml(item.level)}">${escapeHtml(item.message)}</p>`).join("")}
    </div>
  `;
}

function wireSerializationSandboxes() {
  document.querySelectorAll("[data-sandbox='serialization']").forEach((widget) => {
    const sandbox = (state.serializationSandboxes.sandboxes || []).find((item) => item.id === widget.dataset.sandboxId);
    if (!sandbox) return;
    const input = widget.querySelector("[data-serialization-input]");
    const layout = widget.querySelector("[data-serialization-layout]");
    const decimal = widget.querySelector("[data-type-decimal]");
    const output = widget.querySelector("[data-serialization-output]");
    widget.querySelector("[data-serialization-sample]")?.addEventListener("click", () => {
      input.value = sandbox.sample_hex || "";
      if (decimal) decimal.value = sandbox.sample_value || "";
    });
    widget.querySelector("[data-serialization-run]")?.addEventListener("click", async () => {
      output.innerHTML = `<span>Decoding...</span>`;
      try {
        const result = sandbox.codec === "type-alignment"
          ? await analyzeSerializationPayload(sandbox, decimal?.value || "", input.value)
          : await analyzeSerializationPayload(sandbox, input.value, layout.value);
        renderSerializationResult(output, result);
      } catch (error) {
        output.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      }
    });
  });
}

function wireSandboxControls() {
  wireSerializationSandboxes();
  const hashInput = document.querySelector("#hash-input");
  const hashAlgorithm = document.querySelector("#hash-algorithm");
  if (hashInput && hashAlgorithm) {
    hashInput.addEventListener("input", updateHashSandbox);
    hashAlgorithm.addEventListener("change", updateHashSandbox);
    updateHashSandbox();
  }
  const range = document.querySelector("#bond-amount");
  const number = document.querySelector("#bond-amount-number");
  const apr = document.querySelector("#staking-apr");
  const commission = document.querySelector("#staking-commission");
  if (range && number && apr && commission) {
    range.addEventListener("input", () => {
      number.value = range.value;
      updateStakingSandbox();
    });
    [number, apr, commission].forEach((input) => input.addEventListener("input", updateStakingSandbox));
    updateStakingSandbox();
  }
}

function renderDetail() {
  const node = nodeMap()[state.selectedNodeId] || nodeMap()[selectedGoal().task_node_id];
  const detail = document.querySelector("#detail");
  if (!node) {
    detail.innerHTML = "";
    return;
  }
  const trust = trustForNode(node.id);
  const tabBody = {
    assistant: assistantPanel,
    docs: docsPanel,
    code: codePanel,
    state: statePanel,
    sandbox: sandboxPanel,
    risks: risksPanel,
    sources: sourcesPanel,
  }[state.activeTab](node);

  detail.innerHTML = `
    <header class="sidecar-head">
      <span class="type">${escapeHtml(node.type)}</span>
      <span class="trust-badge ${trust.status}">${trustLabel(trust.status)}</span>
      <h2>${escapeHtml(node.label)}</h2>
    </header>
    <nav class="tabs" aria-label="Node detail tabs">
      ${sidecarTabs.map(([id, label]) => `<button type="button" data-tab="${id}" class="${state.activeTab === id ? "active" : ""}">${label}</button>`).join("")}
    </nav>
    <div class="tab-body">${tabBody}</div>
  `;
  detail.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      renderDetail();
    });
  });
  detail.querySelectorAll(".edge[data-node-id]").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.nodeId));
  });
  detail.querySelectorAll(".path-node[data-node-id]").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.nodeId));
  });
  if (state.activeTab === "sandbox") wireSandboxControls();
}

function render() {
  renderGoals();
  const goal = selectedGoal();
  state.selectedNodeId = state.selectedNodeId || goal.task_node_id;
  renderAssistantBridge();
  renderSummary(goal);
  renderGraph(goal);
  renderDetail();
}

async function init() {
  const { nodes, relationships, goals, citations, chunks, sources, trust, networkConditions, liveMetadata } = await loadGraphData();
  state.nodes = nodes;
  state.relationships = relationships;
  state.goals = goals;
  state.citations = citations;
  state.chunks = chunks;
  state.sources = sources;
  state.trust = trust;
  state.networkConditions = networkConditions;
  state.liveMetadata = liveMetadata;
  document.querySelector("#search").addEventListener("change", (event) => renderSearch(event.target.value));
  document.querySelector("#search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") renderSearch(event.currentTarget.value);
  });
  document.querySelector("#assistant-form").addEventListener("submit", (event) => {
    event.preventDefault();
    runAssistantPrompt(document.querySelector("#assistant-prompt").value);
  });
  document.querySelector("#reset").addEventListener("click", () => {
    document.querySelector("#search").value = "";
    document.querySelector("#assistant-prompt").value = "";
    state.selectedGoalId = "build-offline-signer";
    state.selectedNodeId = "offline-transaction-signer";
    state.activeLayer = "all";
    state.activeEdgeTypes = [];
    state.activeTab = "docs";
    state.assistant = { prompt: "", result: null };
    render();
  });
  state.selectedNodeId = selectedGoal().task_node_id;
  render();
}

init().catch((error) => {
  document.querySelector(".horizon-panel").innerHTML = `<pre>${error.stack}</pre>`;
});
