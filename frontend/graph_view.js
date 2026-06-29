import {
  traceHighlightIds,
  availableLayers,
  escapeHtml,
  focusedHorizon,
  nodeLabel,
  nodeLayers,
  primaryEdgeTypes,
  rerender,
  selectNode,
  selectedGoal,
  state,
  trustForNode,
  trustLabel,
} from "./state.js";

const MAX_VISIBLE_NODES = 13;
const MAX_VISIBLE_EDGES = 18;
const PRIORITY_EDGE_TYPES = [
  "REQUIRES",
  "DEPENDS_ON",
  "IMPLEMENTED_BY",
  "USES_TEMPLATE",
  "HAS_GUARDRAIL",
  "CAN_USE_SIGNER",
  "SERIALIZES_AS",
  "HASHES_TO",
  "FAILS_WITH",
  "DEBUGGED_BY",
];

function renderControls() {
  const controls = document.querySelector("#graph-controls");
  const zoomPercent = Math.round(state.graphZoom * 100);
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
    <div class="zoom-controls" aria-label="Graph zoom controls">
      <button type="button" data-zoom="out">-</button>
      <span>${zoomPercent}%</span>
      <button type="button" data-zoom="in">+</button>
      <button type="button" data-zoom="reset">Reset</button>
    </div>
    <details>
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
      rerender();
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
      rerender();
    });
  });
  controls.querySelectorAll("[data-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.zoom;
      if (action === "in") state.graphZoom = Math.min(1.8, Number((state.graphZoom + 0.15).toFixed(2)));
      if (action === "out") state.graphZoom = Math.max(0.7, Number((state.graphZoom - 0.15).toFixed(2)));
      if (action === "reset") state.graphZoom = 1;
      renderGraph(selectedGoal());
    });
  });
}

function edgeScore(edge, focus, highlighted) {
  let score = 0;
  if (edge.source === focus || edge.target === focus) score += 12;
  if (highlighted.has(edge.source)) score += 8;
  if (highlighted.has(edge.target)) score += 8;
  const priorityIndex = PRIORITY_EDGE_TYPES.indexOf(edge.type);
  if (priorityIndex >= 0) score += PRIORITY_EDGE_TYPES.length - priorityIndex;
  if (edge.confidence === "high") score += 2;
  return score;
}

function graphNeighborhood(fullGraph, highlighted) {
  const { focus, nodes, relationships } = fullGraph;
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const selectedIds = new Set([focus]);
  [...highlighted].forEach((id) => {
    if (nodesById.has(id)) selectedIds.add(id);
  });

  const scoredEdges = relationships
    .map((edge) => ({ edge, score: edgeScore(edge, focus, highlighted) }))
    .sort((a, b) => b.score - a.score || a.edge.source.localeCompare(b.edge.source) || a.edge.target.localeCompare(b.edge.target));

  for (const { edge } of scoredEdges) {
    if (selectedIds.size >= MAX_VISIBLE_NODES) break;
    if (selectedIds.has(edge.source) || selectedIds.has(edge.target)) {
      if (nodesById.has(edge.source)) selectedIds.add(edge.source);
      if (selectedIds.size >= MAX_VISIBLE_NODES) break;
      if (nodesById.has(edge.target)) selectedIds.add(edge.target);
    }
  }

  for (const { edge } of scoredEdges) {
    if (selectedIds.size >= MAX_VISIBLE_NODES) break;
    if (nodesById.has(edge.source)) selectedIds.add(edge.source);
    if (selectedIds.size >= MAX_VISIBLE_NODES) break;
    if (nodesById.has(edge.target)) selectedIds.add(edge.target);
  }

  const visibleNodes = [...selectedIds].map((id) => nodesById.get(id)).filter(Boolean);
  const visibleRelationships = scoredEdges
    .map(({ edge }) => edge)
    .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
    .slice(0, MAX_VISIBLE_EDGES);

  return {
    focus,
    nodes: visibleNodes,
    relationships: visibleRelationships,
    totalNodes: nodes.length,
    totalRelationships: relationships.length,
  };
}

function coordinatesFor(nodes, focusId, width = 860) {
  const height = 700;
  const center = { x: width / 2, y: height / 2 };
  const peers = nodes.filter((node) => node.id !== focusId);
  const coords = { [focusId]: center };
  const nodeHalfWidth = 86;
  const nodeHalfHeight = 54;
  const edgePadding = 28;
  const maxRing = Math.max(
    150,
    Math.min(
      width / 2 - nodeHalfWidth - edgePadding,
      height / 2 - nodeHalfHeight - edgePadding,
    ),
  );
  const innerRing = Math.max(135, Math.min(210, maxRing * 0.7));
  const outerRing = Math.max(innerRing + 32, Math.min(300, maxRing));
  peers.forEach((node, index) => {
    const ring = index < 8 ? innerRing : outerRing;
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

export function renderGraph(goal) {
  renderControls();
  state.selectedNodeId = state.selectedNodeId || goal.task_node_id;
  const highlighted = traceHighlightIds();
  const { focus, nodes, relationships, totalNodes, totalRelationships } = graphNeighborhood(focusedHorizon(goal), highlighted);
  const graphElement = document.querySelector("#graph");
  const graphWidth = Math.max(860, Math.min(1180, graphElement.clientWidth || 860));
  const { coords, width, height } = coordinatesFor(nodes, focus, graphWidth);
  const scaledWidth = Math.round(width * state.graphZoom);
  const scaledHeight = Math.round(height * state.graphZoom);
  const omittedNodes = Math.max(0, totalNodes - nodes.length);
  const omittedEdges = Math.max(0, totalRelationships - relationships.length);
  const omittedLabel = omittedNodes || omittedEdges ? ` · ${omittedNodes} nodes / ${omittedEdges} edges hidden` : "";
  document.querySelector("#counts").textContent = `${nodes.length} nodes / ${relationships.length} edges shown${omittedLabel}`;

  const lines = relationships
    .filter((edge) => coords[edge.source] && coords[edge.target])
    .map((edge) => {
      const source = coords[edge.source];
      const target = coords[edge.target];
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const highlightedEdge = highlighted.has(edge.source) && highlighted.has(edge.target);
      const label = relationships.length <= 10 ? `<text class="edge-label ${highlightedEdge ? "trace-highlight" : ""}" x="${midX}" y="${midY}">${escapeHtml(edge.type)}</text>` : "";
      return `
        <line class="graph-edge ${highlightedEdge ? "trace-highlight" : ""}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"></line>
        ${label}
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
          class="canvas-node ${node.id === focus ? "selected" : ""} ${highlighted.has(node.id) ? "trace-highlight" : ""}"
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
    <div class="graph-stage" style="width:${scaledWidth}px;height:${scaledHeight}px">
      <div class="graph-content" style="width:${width}px;height:${height}px;transform:scale(${state.graphZoom})">
        <svg class="edge-canvas" viewBox="0 0 ${width} ${height}" aria-hidden="true">${lines}</svg>
        <div class="node-layer">${nodeButtons}</div>
      </div>
    </div>
  `;
  document.querySelectorAll(".canvas-node[data-node-id]").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.nodeId));
  });
}
