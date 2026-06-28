const state = {
  nodes: [],
  relationships: [],
  goals: [],
  citations: [],
  chunks: [],
  sources: [],
  trust: { nodes: [], sources: [], summary: {} },
  networkConditions: { conditions: [] },
  selectedGoalId: "build-offline-signer",
  selectedNodeId: null,
  activeEdgeTypes: [],
  activeLayer: "all",
  activeTab: "docs",
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
  ["docs", "Documentation"],
  ["code", "Code Snippets"],
  ["state", "State"],
  ["risks", "Risks"],
  ["sources", "Sources"],
];

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json();
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

function focusedHorizon(goal) {
  const map = nodeMap();
  const focus = state.selectedNodeId || goal.task_node_id;
  const base = goalNodeIds(goal);
  const edges = state.relationships.filter((edge) => {
    if (!edgeAllowed(edge)) return false;
    return edge.source === focus || edge.target === focus || (base.has(edge.source) && base.has(edge.target));
  });
  const selected = new Set([focus, ...base]);
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
      return `
        <line class="graph-edge" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"></line>
        <text class="edge-label" x="${midX}" y="${midY}">${escapeHtml(edge.type)}</text>
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
          class="canvas-node ${node.id === focus ? "selected" : ""}"
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
  return networkConditionRows(node.id);
}

function sourcesPanel(node) {
  return citationRows(node.id);
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
    docs: docsPanel,
    code: codePanel,
    state: statePanel,
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
}

function render() {
  renderGoals();
  const goal = selectedGoal();
  state.selectedNodeId = state.selectedNodeId || goal.task_node_id;
  renderSummary(goal);
  renderGraph(goal);
  renderDetail();
}

async function init() {
  const [nodes, relationships, goals, citations, chunks, sources, trust, networkConditions] = await Promise.all([
    loadJson("../data/nodes.json"),
    loadJson("../data/relationships.json"),
    loadJson("../data/goal_paths.json"),
    loadJson("../data/citations.json"),
    loadJson("../data/chunks.json"),
    loadJson("../data/sources.json"),
    loadJson("../data/trust_report.json"),
    loadJson("../data/network_conditions.json"),
  ]);
  state.nodes = nodes;
  state.relationships = relationships;
  state.goals = goals;
  state.citations = citations;
  state.chunks = chunks;
  state.sources = sources;
  state.trust = trust;
  state.networkConditions = networkConditions;
  document.querySelector("#search").addEventListener("change", (event) => renderSearch(event.target.value));
  document.querySelector("#search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") renderSearch(event.currentTarget.value);
  });
  document.querySelector("#reset").addEventListener("click", () => {
    document.querySelector("#search").value = "";
    state.selectedGoalId = "build-offline-signer";
    state.selectedNodeId = "offline-transaction-signer";
    state.activeLayer = "all";
    state.activeEdgeTypes = [];
    state.activeTab = "docs";
    render();
  });
  state.selectedNodeId = selectedGoal().task_node_id;
  render();
}

init().catch((error) => {
  document.querySelector(".horizon-panel").innerHTML = `<pre>${error.stack}</pre>`;
});
