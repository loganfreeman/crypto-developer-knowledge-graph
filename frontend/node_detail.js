import { traceBuilderPanel } from "./trace_builder.js";
import { sandboxPanel, wireSandboxControls } from "./sandboxes.js";
import {
  byId,
  edgeAllowed,
  escapeHtml,
  liveMetadataForNode,
  networkConditionsForNode,
  nodeLayers,
  nodeMap,
  nodeLabel,
  operationalPlaybooksForNode,
  selectNode,
  selectedGoal,
  sidecarTabs,
  state,
  trustForNode,
  trustLabel,
} from "./state.js";

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

function listItems(items) {
  return `<ul class="note-list">${(items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function operationalPanel(node) {
  const playbooks = operationalPlaybooksForNode(node.id);
  if (!playbooks.length) return `<p class="muted">No operational failure playbook is attached to this node yet.</p>`;
  return playbooks
    .map((playbook) => `
      <article class="ops-playbook">
        <div class="ops-head">
          <span>${escapeHtml(playbook.severity || "operational")}</span>
          <h3>${escapeHtml(playbook.problem)}</h3>
        </div>
        <p>${escapeHtml(playbook.summary || "")}</p>
        <section>
          <h4>Common Causes</h4>
          ${listItems(playbook.common_causes)}
        </section>
        <section>
          <h4>Example Logs</h4>
          <div class="log-list">${(playbook.example_logs || []).map((item) => `<code>${escapeHtml(item)}</code>`).join("")}</div>
        </section>
        <section>
          <h4>Solutions</h4>
          ${listItems(playbook.solutions)}
        </section>
        <section>
          <h4>Affected Chains</h4>
          <div class="tag-list">${(playbook.affected_chains || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
        </section>
      </article>
    `)
    .join("");
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

export function renderDetail() {
  const node = nodeMap()[state.selectedNodeId] || nodeMap()[selectedGoal().task_node_id];
  const detail = document.querySelector("#detail");
  if (!node) {
    detail.innerHTML = "";
    return;
  }
  const trust = trustForNode(node.id);
  const tabBody = {
    trace: traceBuilderPanel,
    docs: docsPanel,
    code: codePanel,
    ops: operationalPanel,
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
