import { analyzeSerializationPayload } from "./serialization_sandbox.js";
import {
  escapeHtml,
  networkConditionsForNode,
  nodeMatches,
  serializationSandboxesForNode,
  state,
} from "./state.js";

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

export function sandboxPanel(node) {
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

export function wireSandboxControls() {
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
