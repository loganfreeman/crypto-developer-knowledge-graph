import { renderTraceBuilderBridge, runTraceBuilderPrompt } from "./trace_builder.js";
import { loadGraphData } from "./data.js";
import { renderGraph } from "./graph_view.js";
import { renderDetail } from "./node_detail.js";
import {
  escapeHtml,
  nodeMap,
  nodeSearchText,
  selectNode,
  selectedGoal,
  setRenderCallback,
  state,
} from "./state.js";

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

function renderSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    render();
    return;
  }
  const result = state.nodes.find((node) => nodeSearchText(node).includes(q));
  if (result) selectNode(result.id);
}

function render() {
  renderGoals();
  const goal = selectedGoal();
  state.selectedNodeId = state.selectedNodeId || goal.task_node_id;
  renderTraceBuilderBridge();
  renderSummary(goal);
  renderGraph(goal);
  renderDetail();
}

function resetState() {
  document.querySelector("#search").value = "";
  document.querySelector("#trace-prompt").value = "";
  state.selectedGoalId = "build-offline-signer";
  state.selectedNodeId = "offline-transaction-signer";
  state.activeLayer = "all";
  state.activeEdgeTypes = [];
  state.activeTab = "docs";
  state.graphZoom = 1;
  state.traceBuilder = { prompt: "", result: null, loading: false, error: "" };
  render();
}

function bindShellEvents() {
  document.querySelector("#search").addEventListener("change", (event) => renderSearch(event.target.value));
  document.querySelector("#search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") renderSearch(event.currentTarget.value);
  });
  document.querySelector("#trace-form").addEventListener("submit", (event) => {
    event.preventDefault();
    runTraceBuilderPrompt(document.querySelector("#trace-prompt").value);
  });
  document.querySelector("#reset").addEventListener("click", resetState);
}

async function init() {
  setRenderCallback(render);
  const { nodes, relationships, goals, citations, chunks, sources, trust, networkConditions, liveMetadata, serializationSandboxes } = await loadGraphData();
  state.nodes = nodes;
  state.relationships = relationships;
  state.goals = goals;
  state.citations = citations;
  state.chunks = chunks;
  state.sources = sources;
  state.trust = trust;
  state.networkConditions = networkConditions;
  state.liveMetadata = liveMetadata;
  state.serializationSandboxes = serializationSandboxes;
  bindShellEvents();
  state.selectedNodeId = selectedGoal().task_node_id;
  render();
}

init().catch((error) => {
  document.querySelector(".knowledge-shell").innerHTML = `<pre>${error.stack}</pre>`;
});
