import {
  escapeHtml,
  nodeLabel,
  nodeMap,
  rerender,
  state,
} from "./state.js";
import { postJson } from "./data.js";

export async function runTraceBuilderPrompt(query) {
  const prompt = query.trim();
  if (!prompt) return;
  state.traceBuilder = { prompt, result: null, loading: true, error: "" };
  rerender();
  try {
    const result = await postJson("/api/trace-builder", { q: prompt, goal_id: state.selectedGoalId, limit: 7 });
    state.traceBuilder = { prompt, result, loading: false, error: "" };
    state.selectedGoalId = result.goalId || state.selectedGoalId;
    state.selectedNodeId = result.focusNodeId || result.highlightedNodeIds[0] || state.selectedNodeId;
    state.activeLayer = "all";
    state.activeEdgeTypes = [];
    state.activeTab = "trace";
  } catch (error) {
    state.traceBuilder = { prompt, result: null, loading: false, error: error.message };
    state.activeTab = "trace";
  }
  rerender();
}

export function renderTraceBuilderBridge() {
  const input = document.querySelector("#trace-prompt");
  if (input && document.activeElement !== input) input.value = state.traceBuilder.prompt || "";
}

export function traceBuilderPanel() {
  if (state.traceBuilder.loading) {
    return `
      <section class="trace-answer">
        <p class="muted">Building trace from the API...</p>
      </section>
    `;
  }
  if (state.traceBuilder.error) {
    return `
      <section class="trace-answer">
        <p class="muted">${escapeHtml(state.traceBuilder.error)}</p>
      </section>
    `;
  }
  const result = state.traceBuilder.result;
  if (!result) {
    return `
      <section class="trace-answer">
        <p class="muted">Enter a problem statement to request an API-built graph trace.</p>
      </section>
    `;
  }
  return `
    <section class="trace-answer">
      <p class="eyebrow">Prompt</p>
      <blockquote>${escapeHtml(result.prompt)}</blockquote>
      <h3>${escapeHtml(result.title)}</h3>
      <div class="trace-path">
        ${result.highlightedNodeIds.map((id) => `
          <button type="button" class="path-node" data-node-id="${id}">
            <span>${escapeHtml(nodeMap()[id]?.type || "Node")}</span>
            <strong>${escapeHtml(nodeLabel(id))}</strong>
          </button>
        `).join("")}
      </div>
      <div class="detail-section">
        <h3>Trace Steps</h3>
        <ol class="step-list">${result.architecturalSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      </div>
      <div class="detail-section">
        <h3>Grounding Notes</h3>
        <ul class="note-list">${result.caveats.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
      </div>
    </section>
  `;
}
