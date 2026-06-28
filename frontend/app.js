const state = {
  nodes: [],
  relationships: [],
  goals: [],
  citations: [],
  chunks: [],
  sources: [],
  selectedGoalId: "build-wallet",
  selectedNodeId: null,
};

const typeOrder = ["Concepts", "APIs", "Security warnings"];

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

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  renderDetail();
  document.querySelectorAll(".node").forEach((card) => {
    card.setAttribute("aria-pressed", String(card.dataset.nodeId === nodeId));
  });
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

function renderGraph(goal, nodeMap) {
  const selected = new Set([
    goal.task_node_id,
    ...goal.concepts,
    ...goal.apis,
    ...goal.code_examples,
    ...goal.security_warnings,
    ...goal.supported_chains,
  ]);
  const nodes = [...selected].map((id) => nodeMap[id]).filter(Boolean);
  const relationships = state.relationships.filter((edge) => selected.has(edge.source) && selected.has(edge.target));
  document.querySelector("#counts").textContent = `${nodes.length} nodes / ${relationships.length} edges`;
  document.querySelector("#graph").innerHTML = nodes
    .map((node) => `
      <button class="node" type="button" data-node-id="${node.id}" aria-pressed="${String(state.selectedNodeId === node.id)}">
        <span class="type">${node.type}</span>
        <strong>${escapeHtml(node.label)}</strong>
        <p>${escapeHtml(node.summary)}</p>
        <div class="relationships">${relatedText(node.id, relationships)}</div>
      </button>
    `)
    .join("");
  bindNodeCards();
  if (!state.selectedNodeId || !nodeMap[state.selectedNodeId]) {
    state.selectedNodeId = goal.task_node_id;
  }
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
  document.querySelector("#graph").innerHTML = results
    .map((node) => `
      <button class="node" type="button" data-node-id="${node.id}" aria-pressed="${String(state.selectedNodeId === node.id)}">
        <span class="type">${node.type}</span>
        <strong>${escapeHtml(node.label)}</strong>
        <p>${escapeHtml(node.summary)}</p>
        <div class="relationships">${relatedText(node.id, state.relationships)}</div>
      </button>
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
    .map((edge) => {
      const outward = edge.source === nodeId;
      const peer = outward ? edge.target : edge.source;
      return `
        <button class="edge" type="button" data-node-id="${peer}">
          <span>${outward ? edge.type : "IN_" + edge.type}</span>
          <strong>${escapeHtml(nodeLabel(peer))}</strong>
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
  const code = node.code ? `<pre><code>${escapeHtml(node.code)}</code></pre>` : "";
  detail.innerHTML = `
    <div class="detail-head">
      <span class="type">${escapeHtml(node.type)}</span>
      <h2>${escapeHtml(node.label)}</h2>
      <p>${escapeHtml(node.summary)}</p>
    </div>
    ${code}
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
  const [nodes, relationships, goals, citations, chunks, sources] = await Promise.all([
    loadJson("../data/nodes.json"),
    loadJson("../data/relationships.json"),
    loadJson("../data/goal_paths.json"),
    loadJson("../data/citations.json"),
    loadJson("../data/chunks.json"),
    loadJson("../data/sources.json"),
  ]);
  state.nodes = nodes;
  state.relationships = relationships;
  state.goals = goals;
  state.citations = citations;
  state.chunks = chunks;
  state.sources = sources;
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
