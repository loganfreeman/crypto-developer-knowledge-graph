const state = {
  nodes: [],
  relationships: [],
  goals: [],
  selectedGoalId: "build-wallet",
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
  `;
}

function renderColumns(goal) {
  const columns = [
    ["Concepts", goal.concepts],
    ["APIs", goal.apis],
    ["Security warnings", goal.security_warnings],
  ];
  document.querySelector("#columns").innerHTML = columns
    .map(([title, ids]) => `
      <article class="column">
        <h3>${title}</h3>
        <ul>${ids.map((id) => `<li><span class="pill">${id}</span></li>`).join("")}</ul>
      </article>
    `)
    .join("");
}

function relatedText(nodeId, relationships) {
  return relationships
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .slice(0, 4)
    .map((edge) => `${edge.source === nodeId ? edge.type : "IN_" + edge.type} ${edge.source === nodeId ? edge.target : edge.source}`)
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
      <article class="node">
        <span class="type">${node.type}</span>
        <strong>${node.label}</strong>
        <p>${node.summary}</p>
        <div class="relationships">${relatedText(node.id, relationships)}</div>
      </article>
    `)
    .join("");
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
      <article class="node">
        <span class="type">${node.type}</span>
        <strong>${node.label}</strong>
        <p>${node.summary}</p>
        <div class="relationships">${relatedText(node.id, state.relationships)}</div>
      </article>
    `)
    .join("");
}

function render() {
  renderGoals();
  const nodeMap = byId(state.nodes);
  const goal = state.goals.find((item) => item.id === state.selectedGoalId) || state.goals[0];
  renderSummary(goal, nodeMap);
  renderColumns(goal);
  renderGraph(goal, nodeMap);
}

async function init() {
  const [nodes, relationships, goals] = await Promise.all([
    loadJson("../data/nodes.json"),
    loadJson("../data/relationships.json"),
    loadJson("../data/goal_paths.json"),
  ]);
  state.nodes = nodes;
  state.relationships = relationships;
  state.goals = goals;
  document.querySelector("#search").addEventListener("input", (event) => renderSearch(event.target.value, byId(state.nodes)));
  document.querySelector("#reset").addEventListener("click", () => {
    document.querySelector("#search").value = "";
    state.selectedGoalId = "build-wallet";
    render();
  });
  render();
}

init().catch((error) => {
  document.querySelector(".workspace").innerHTML = `<pre>${error.stack}</pre>`;
});
