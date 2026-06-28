const state = {
  nodes: [],
  relationships: [],
  goals: [],
  citations: [],
  chunks: [],
  sources: [],
  trust: { nodes: [], sources: [], summary: {} },
  selectedGoalId: "build-wallet",
  selectedNodeId: null,
  activeEdgeTypes: [],
  activeLayer: "all",
};

const typeOrder = ["Concepts", "APIs", "Security warnings"];
const primaryEdgeTypes = ["REQUIRES", "DEPENDS_ON", "CALLS", "USES_TEMPLATE", "CAN_USE_SIGNER", "HAS_GUARDRAIL", "VERIFIES_WITH", "ENABLES", "RUNS_ON"];

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

function nodeLabel(nodeId) {
  const node = byId(state.nodes)[nodeId];
  return node ? node.label : nodeId;
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
      render();
    });
    nav.appendChild(button);
  });
}

function renderSummary(goal, nodeMap) {
  document.querySelector("#title").textContent = goal.title;
  const task = nodeMap[goal.task_node_id];
  document.querySelector("#summary").innerHTML = `
    <h3>${task.label}</h3>
    <p>${task.summary}</p>
    <div class="trust-summary">
      <span>${state.trust.summary.uncited_production_nodes || 0} uncited production nodes</span>
      <span>${state.trust.summary.stale_sources || 0} stale sources</span>
      <span>${state.trust.summary.changed_sources || 0} changed sources</span>
    </div>
    <div class="recipe">
      <div>
        <h4>Example Flow</h4>
        <ol>${goal.example_flow.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      </div>
      <div>
        <h4>Supported Chains</h4>
        <div class="tag-list">${goal.supported_chains.map((id) => `<span>${escapeHtml(nodeMap[id]?.label || id)}</span>`).join("")}</div>
      </div>
      <div>
        <h4>Database Stack</h4>
        <ul>${goal.suggested_database_stack.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
    </div>
  `;
}

function renderColumns(goal) {
  const nodeMap = byId(state.nodes);
  const columns = [
    ["Concepts", goal.concepts],
    ["APIs", goal.apis],
    ["Security warnings", goal.security_warnings],
  ];
  document.querySelector("#columns").innerHTML = columns
    .map(([title, ids]) => `
      <article class="column">
        <h3>${title}</h3>
        <ul>${ids.map((id) => `<li><button class="pill" type="button" data-node-id="${id}">${escapeHtml(nodeMap[id]?.label || id)}</button></li>`).join("")}</ul>
      </article>
    `)
    .join("");
  document.querySelectorAll(".pill[data-node-id]").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.nodeId));
  });
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
    <div>
      <h4>Layer</h4>
      <div class="filter-row">${layerButtons}</div>
    </div>
    <div>
      <h4>Edge Types</h4>
      <div class="filter-row">${edgeButtons}</div>
    </div>
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

function relatedText(nodeId, relationships) {
  return relationships
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .slice(0, 4)
    .map((edge) => {
      const outward = edge.source === nodeId;
      return `${outward ? edge.type : "IN_" + edge.type} ${escapeHtml(nodeLabel(outward ? edge.target : edge.source))}`;
    })
    .join("<br>");
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

function focusedHorizon(goal, nodeMap) {
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
  const nodes = [...selected].map((id) => nodeMap[id]).filter(Boolean).filter(nodeAllowedByLayer);
  const visibleIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    relationships: edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
  };
}

function groupNodes(nodes) {
  const groups = {};
  nodes.forEach((node) => {
    const group = node.display_group || nodeLayers(node)[0] || node.type;
    groups[group] = groups[group] || [];
    groups[group].push(node);
  });
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

function renderGraph(goal, nodeMap) {
  renderControls();
  state.selectedNodeId = state.selectedNodeId || goal.task_node_id;
  const { nodes, relationships } = focusedHorizon(goal, nodeMap);
  document.querySelector("#counts").textContent = `${nodes.length} nodes / ${relationships.length} edges`;
  document.querySelector("#graph").innerHTML = groupNodes(nodes)
    .map(([group, groupNodes]) => `
      <section class="lane">
        <div class="lane-head">
          <h4>${escapeHtml(group)}</h4>
          <span>${groupNodes.length}</span>
        </div>
        <div class="lane-nodes">
          ${groupNodes.map((node) => `
            <button class="node" type="button" data-node-id="${node.id}" aria-pressed="${String(state.selectedNodeId === node.id)}">
              <span class="type">${node.type}</span>
              <span class="trust-badge ${trustForNode(node.id).status}">${trustLabel(trustForNode(node.id).status)}</span>
              <strong>${escapeHtml(node.label)}</strong>
              <p>${escapeHtml(node.summary)}</p>
              <div class="relationships">${relatedText(node.id, relationships)}</div>
            </button>
          `).join("")}
        </div>
      </section>
    `)
    .join("");
  bindNodeCards();
  renderDetail();
}

function renderSearch(query, nodeMap) {
  const q = query.trim().toLowerCase();
  if (!q) {
    render();
    return;
  }
  const results = state.nodes.filter((node) => {
    const text = `${node.id} ${node.label} ${node.type} ${node.summary} ${(node.tags || []).join(" ")}`.toLowerCase();
    return text.includes(q);
  });
  document.querySelector("#title").textContent = `Search: ${query}`;
  document.querySelector("#summary").innerHTML = `<h3>${results.length} results</h3><p>Matching typed graph nodes across protocols, primitives, interfaces, tasks, and risks.</p>`;
  document.querySelector("#columns").innerHTML = typeOrder
    .map((title) => `<article class="column"><h3>${title}</h3><ul><li><span class="pill">Use a goal path to restore workflow view</span></li></ul></article>`)
    .join("");
  document.querySelector("#counts").textContent = `${results.length} nodes`;
  renderControls();
  document.querySelector("#graph").innerHTML = groupNodes(results.filter(nodeAllowedByLayer))
    .map(([group, groupNodes]) => `
      <section class="lane">
        <div class="lane-head">
          <h4>${escapeHtml(group)}</h4>
          <span>${groupNodes.length}</span>
        </div>
        <div class="lane-nodes">
          ${groupNodes.map((node) => `
            <button class="node" type="button" data-node-id="${node.id}" aria-pressed="${String(state.selectedNodeId === node.id)}">
              <span class="type">${node.type}</span>
              <span class="trust-badge ${trustForNode(node.id).status}">${trustLabel(trustForNode(node.id).status)}</span>
              <strong>${escapeHtml(node.label)}</strong>
              <p>${escapeHtml(node.summary)}</p>
              <div class="relationships">${relatedText(node.id, state.relationships.filter(edgeAllowed))}</div>
            </button>
          `).join("")}
        </div>
      </section>
    `)
    .join("");
  bindNodeCards();
  if (results.length && !results.some((node) => node.id === state.selectedNodeId)) {
    state.selectedNodeId = results[0].id;
  }
  renderDetail();
}

function bindNodeCards() {
  document.querySelectorAll(".node[data-node-id]").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.nodeId));
  });
}

function relationshipRows(nodeId) {
  return state.relationships
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .filter(edgeAllowed)
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
  if (!rows.length) {
    return `<p class="muted">No citation has been attached yet.</p>`;
  }
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

function renderDetail() {
  const nodeMap = byId(state.nodes);
  const node = nodeMap[state.selectedNodeId] || nodeMap[state.goals[0]?.task_node_id];
  const detail = document.querySelector("#detail");
  if (!node) {
    detail.innerHTML = "";
    return;
  }
  const code = node.code ? `
    <section class="detail-section">
      <h3>${node.type === "PayloadTemplate" ? "Payload Template" : "Code"}</h3>
      <pre><code>${escapeHtml(node.code)}</code></pre>
    </section>
  ` : "";
  const notes = node.implementation_notes ? `
    <section class="detail-section">
      <h3>Implementation Notes</h3>
      <ul class="note-list">${node.implementation_notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
    </section>
  ` : "";
  const trust = trustForNode(node.id);
  detail.innerHTML = `
    <div class="detail-head">
      <span class="type">${escapeHtml(node.type)}</span>
      <span class="trust-badge ${trust.status}">${trustLabel(trust.status)}</span>
      <h2>${escapeHtml(node.label)}</h2>
      <p>${escapeHtml(node.summary)}</p>
      <div class="trust-panel">
        <strong>Trust</strong>
        <span>Status: ${escapeHtml(trustLabel(trust.status))}</span>
        <span>Citations: ${escapeHtml(trust.citation_count)}</span>
        <span>Staleness risk: ${escapeHtml(trust.staleness_risk)}</span>
      </div>
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
    </div>
    ${code}
    ${notes}
    <section class="detail-section">
      <h3>Relationships</h3>
      <div class="edge-list">${relationshipRows(node.id) || `<p class="muted">No relationships yet.</p>`}</div>
    </section>
    <section class="detail-section">
      <h3>Citations</h3>
      ${citationRows(node.id)}
    </section>
    <section class="detail-section">
      <h3>Tags</h3>
      <div class="tag-list">${(node.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || `<p class="muted">No tags yet.</p>`}</div>
    </section>
  `;
  detail.querySelectorAll(".edge[data-node-id]").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.nodeId));
  });
}

function render() {
  renderGoals();
  const nodeMap = byId(state.nodes);
  const goal = state.goals.find((item) => item.id === state.selectedGoalId) || state.goals[0];
  state.selectedNodeId = state.selectedNodeId || goal.task_node_id;
  renderSummary(goal, nodeMap);
  renderColumns(goal);
  renderGraph(goal, nodeMap);
}

async function init() {
  const [nodes, relationships, goals, citations, chunks, sources, trust] = await Promise.all([
    loadJson("../data/nodes.json"),
    loadJson("../data/relationships.json"),
    loadJson("../data/goal_paths.json"),
    loadJson("../data/citations.json"),
    loadJson("../data/chunks.json"),
    loadJson("../data/sources.json"),
    loadJson("../data/trust_report.json"),
  ]);
  state.nodes = nodes;
  state.relationships = relationships;
  state.goals = goals;
  state.citations = citations;
  state.chunks = chunks;
  state.sources = sources;
  state.trust = trust;
  document.querySelector("#search").addEventListener("input", (event) => renderSearch(event.target.value, byId(state.nodes)));
  document.querySelector("#reset").addEventListener("click", () => {
    document.querySelector("#search").value = "";
    state.selectedGoalId = "build-wallet";
    state.selectedNodeId = "wallet-building";
    render();
  });
  render();
}

init().catch((error) => {
  document.querySelector(".workspace").innerHTML = `<pre>${error.stack}</pre>`;
});
