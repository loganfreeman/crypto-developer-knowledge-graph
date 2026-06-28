const textEncoder = new TextEncoder();
const WASM_CORE_BASE64 = "AGFzbQEAAAABBQFgAAF/AwIBAAcLAQd2ZXJzaW9uAAAKBgEEAEEBCw==";

function normalizeHex(input) {
  const hex = input.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (!hex) throw new Error("Paste a hex payload first.");
  if (hex.length % 2) throw new Error(`Odd-length hex at nibble ${hex.length}.`);
  if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error("Payload contains non-hex characters.");
  return hex.toLowerCase();
}

export async function loadSerializationWasm() {
  const wasmBytes = Uint8Array.from(atob(WASM_CORE_BASE64), (char) => char.charCodeAt(0));
  const module = await WebAssembly.instantiate(wasmBytes);
  const version = module.instance.exports.version();
  const source = new Uint8Array([...wasmBytes, ...textEncoder.encode(`:${version}`)]);
  if (!globalThis.crypto?.subtle) {
    return {
      runtime: `wasm-core-v${version}`,
      fingerprint: source.reduce((acc, byte) => ((acc * 31 + byte) >>> 0), 0).toString(16).padStart(8, "0"),
    };
  }
  const digest = await crypto.subtle.digest("SHA-256", source);
  return {
    runtime: `wasm-core-v${version}`,
    fingerprint: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  };
}

function hexSlice(bytes, start, end) {
  return bytes.slice(start, end).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesFromHex(input) {
  const hex = normalizeHex(input);
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return bytes;
}

function parseIntegerInput(value, hexValue = "") {
  const decimal = value.trim();
  const hex = hexValue.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (decimal) {
    if (!/^[0-9]+$/.test(decimal)) throw new Error("Decimal integer contains non-numeric characters.");
    return BigInt(decimal);
  }
  if (hex) {
    if (hex.length % 2) throw new Error(`Odd-length hex at nibble ${hex.length}.`);
    if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error("Hex integer contains non-hex characters.");
    return BigInt(`0x${hex}`);
  }
  throw new Error("Enter a decimal integer or hex bytes.");
}

function bigintToBytes(value, length, endianness) {
  if (value < 0n) throw new Error("Negative integers are not supported by these unsigned guardrails.");
  const bytes = [];
  let remaining = value;
  while (remaining > 0n) {
    bytes.push(Number(remaining & 0xffn));
    remaining >>= 8n;
  }
  if (length && bytes.length > length) throw new Error(`Integer needs ${bytes.length} bytes, exceeding ${length}.`);
  while (length && bytes.length < length) bytes.push(0);
  const ordered = endianness === "big" ? [...bytes].reverse() : bytes;
  return ordered.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBigint(bytes, endianness) {
  const ordered = endianness === "little" ? [...bytes].reverse() : bytes;
  return ordered.reduce((acc, byte) => (acc << 8n) + BigInt(byte), 0n);
}

function parseRlpItem(bytes, offset = 0, depth = 0) {
  if (offset >= bytes.length) throw new Error(`RLP ended before tuple index at byte ${offset}.`);
  const prefix = bytes[offset];
  if (prefix <= 0x7f) {
    return { kind: "byte", offset, length: 1, payloadOffset: offset, payloadLength: 1, children: [], valueHex: hexSlice(bytes, offset, offset + 1), depth };
  }
  if (prefix <= 0xb7) {
    const length = prefix - 0x80;
    const payloadOffset = offset + 1;
    if (payloadOffset + length > bytes.length) throw new Error(`RLP string at byte ${offset} declares ${length} bytes but payload ends at ${bytes.length}.`);
    return { kind: "string", offset, length: 1 + length, payloadOffset, payloadLength: length, children: [], valueHex: hexSlice(bytes, payloadOffset, payloadOffset + length), depth };
  }
  if (prefix <= 0xbf) {
    const lengthOfLength = prefix - 0xb7;
    const payloadLength = readBigEndian(bytes, offset + 1, lengthOfLength);
    const payloadOffset = offset + 1 + lengthOfLength;
    if (payloadOffset + payloadLength > bytes.length) throw new Error(`RLP long string at byte ${offset} overruns payload.`);
    return { kind: "string", offset, length: 1 + lengthOfLength + payloadLength, payloadOffset, payloadLength, children: [], valueHex: hexSlice(bytes, payloadOffset, payloadOffset + payloadLength), depth };
  }
  const shortList = prefix <= 0xf7;
  const lengthOfLength = shortList ? 0 : prefix - 0xf7;
  const payloadLength = shortList ? prefix - 0xc0 : readBigEndian(bytes, offset + 1, lengthOfLength);
  const payloadOffset = offset + 1 + lengthOfLength;
  if (payloadOffset + payloadLength > bytes.length) throw new Error(`RLP list at byte ${offset} overruns payload.`);
  const children = [];
  let cursor = payloadOffset;
  while (cursor < payloadOffset + payloadLength) {
    const child = parseRlpItem(bytes, cursor, depth + 1);
    children.push(child);
    cursor += child.length;
  }
  return { kind: "list", offset, length: 1 + lengthOfLength + payloadLength, payloadOffset, payloadLength, children, valueHex: "", depth };
}

function readBigEndian(bytes, offset, length) {
  let value = 0;
  for (let i = 0; i < length; i += 1) value = value * 256 + bytes[offset + i];
  return value;
}

function parseScaleCompact(bytes, offset) {
  if (offset >= bytes.length) throw new Error(`SCALE compact integer missing at byte ${offset}.`);
  const first = bytes[offset];
  const mode = first & 0b11;
  if (mode === 0) return { value: first >> 2, length: 1 };
  if (mode === 1) {
    if (offset + 2 > bytes.length) throw new Error(`SCALE compact u16 overruns at byte ${offset}.`);
    return { value: ((bytes[offset + 1] << 8) + first) >> 2, length: 2 };
  }
  if (mode === 2) {
    if (offset + 4 > bytes.length) throw new Error(`SCALE compact u32 overruns at byte ${offset}.`);
    const value = bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] << 24);
    return { value: value >>> 2, length: 4 };
  }
  const byteLength = (first >> 2) + 4;
  if (offset + 1 + byteLength > bytes.length) throw new Error(`SCALE compact big-int overruns at byte ${offset}.`);
  return { value: `0x${hexSlice(bytes, offset + 1, offset + 1 + byteLength)}`, length: 1 + byteLength };
}

function parseCborItem(bytes, offset = 0, depth = 0) {
  if (offset >= bytes.length) throw new Error(`CBOR item missing at byte ${offset}.`);
  const initial = bytes[offset];
  const major = initial >> 5;
  const additional = initial & 0x1f;
  const lengthInfo = readCborLength(bytes, offset + 1, additional);
  const headerLength = 1 + lengthInfo.bytes;
  const value = lengthInfo.value;
  if (major === 4 || major === 5) {
    const children = [];
    let cursor = offset + headerLength;
    const itemCount = major === 5 ? value * 2 : value;
    for (let i = 0; i < itemCount; i += 1) {
      const child = parseCborItem(bytes, cursor, depth + 1);
      children.push(child);
      cursor += child.length;
    }
    return { kind: major === 4 ? "array" : "map", offset, length: cursor - offset, count: value, children, depth };
  }
  let payloadLength = 0;
  if (major === 2 || major === 3) payloadLength = value;
  if (offset + headerLength + payloadLength > bytes.length) throw new Error(`CBOR item at byte ${offset} overruns payload.`);
  return { kind: cborKind(major), offset, length: headerLength + payloadLength, value, valueHex: hexSlice(bytes, offset + headerLength, offset + headerLength + payloadLength), children: [], depth };
}

function readCborLength(bytes, offset, additional) {
  if (additional < 24) return { value: additional, bytes: 0 };
  const lengths = { 24: 1, 25: 2, 26: 4, 27: 8 };
  const count = lengths[additional];
  if (!count) throw new Error(`Indefinite or reserved CBOR length at byte ${offset - 1}; canonical DAG-CBOR must be definite.`);
  if (offset + count > bytes.length) throw new Error(`CBOR length overruns at byte ${offset}.`);
  return { value: readBigEndian(bytes, offset, count), bytes: count };
}

function cborKind(major) {
  return ["uint", "negint", "bytes", "text", "array", "map", "tag", "simple"][major] || "unknown";
}

function evaluateLayout(layout, parsed, bytes, codec) {
  const fields = layout.fields || [];
  if (codec === "rlp") {
    if (parsed.kind !== "list") return [{ level: "error", message: "Root RLP item is not a list; transaction payloads must be list tuples." }];
    return tupleDiagnostics(fields, parsed.children, "RLP tuple");
  }
  if (codec === "cbor") {
    if (!["array", "map"].includes(parsed.kind)) return [{ level: "error", message: "Root CBOR item is not an array/map; Filecoin message bytes should decode as a deterministic tuple/object." }];
    return tupleDiagnostics(fields, parsed.children, "CBOR tuple");
  }
  if (codec === "scale") return scaleDiagnostics(fields, bytes);
  return [];
}

function tupleDiagnostics(fields, children, label) {
  const expected = fields.length;
  const actual = children.length;
  const diagnostics = [];
  if (actual !== expected) {
    const index = Math.min(actual, expected) - 1;
    diagnostics.push({
      level: "error",
      message: `${label} field count mismatch: expected ${expected}, decoded ${actual}. Misalignment begins near tuple index ${Math.max(index + 1, 0)}.`,
    });
  }
  fields.forEach((field, index) => {
    const child = children[index];
    if (!child) {
      diagnostics.push({ level: "error", message: `Missing tuple index ${index}: ${field}.` });
    } else {
      diagnostics.push({ level: "ok", message: `Index ${index} ${field}: ${child.kind}, bytes ${child.offset}-${child.offset + child.length - 1}.` });
    }
  });
  return diagnostics;
}

function scaleDiagnostics(fields, bytes) {
  const diagnostics = [];
  let offset = 0;
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    try {
      const start = offset;
      let length = field.length || 0;
      let value = "";
      if (field.type === "scaleCompact") {
        const compact = parseScaleCompact(bytes, offset);
        length = compact.length;
        value = String(compact.value);
      } else if (field.type === "u32le") {
        length = 4;
        if (offset + length > bytes.length) throw new Error(`u32le overruns at byte ${offset}.`);
        value = String(bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] << 24));
      } else {
        if (offset + length > bytes.length) throw new Error(`${field.name} overruns at byte ${offset}.`);
        value = `0x${hexSlice(bytes, offset, offset + length)}`;
      }
      offset += length;
      diagnostics.push({ level: "ok", message: `Index ${index} ${field.name}: ${field.type}, bytes ${start}-${offset - 1}, value ${value}.` });
    } catch (error) {
      diagnostics.push({ level: "error", message: `Index ${index} ${field.name} misaligned: ${error.message}` });
      break;
    }
  }
  if (offset < bytes.length) diagnostics.push({ level: "warn", message: `${bytes.length - offset} trailing byte(s) after expected SCALE layout; runtime metadata may define extra signed extensions.` });
  if (offset > bytes.length) diagnostics.push({ level: "error", message: `Layout consumed beyond payload length at byte ${offset}.` });
  return diagnostics;
}

function analyzeTypeAlignment(sandbox, valueInput, hexInput) {
  const value = parseIntegerInput(valueInput, hexInput);
  const hex = hexInput.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  const bytes = hex ? bytesFromHex(hex) : [];
  const diagnostics = [];
  for (const type of sandbox.types || []) {
    const min = type.min === null ? null : BigInt(type.min);
    const max = type.max === null ? null : BigInt(type.max);
    if (min !== null && value < min) {
      diagnostics.push({ level: "error", message: `${type.label}: underflows minimum ${min}.` });
    } else if (max !== null && value > max) {
      diagnostics.push({ level: "error", message: `${type.label}: overflows maximum ${max}.` });
    } else {
      diagnostics.push({ level: "ok", message: `${type.label}: value is representable.` });
    }
  }
  for (const encoding of sandbox.encodings || []) {
    try {
      const encoded = bigintToBytes(value, encoding.byte_length, encoding.endianness);
      diagnostics.push({ level: "ok", message: `${encoding.label}: encodes as 0x${encoded}.` });
    } catch (error) {
      diagnostics.push({ level: "error", message: `${encoding.label}: ${error.message}` });
    }
  }
  if (bytes.length) {
    const little = bytesToBigint(bytes, "little");
    const big = bytesToBigint(bytes, "big");
    diagnostics.push({ level: little === big ? "ok" : "warn", message: `Hex interpreted little-endian: ${little.toString()}.` });
    diagnostics.push({ level: "ok", message: `Hex interpreted big-endian: ${big.toString()}.` });
    if (little !== big) diagnostics.push({ level: "warn", message: "Endian interpretations differ; verify whether the target codec is SCALE little-endian or CBOR big-endian before signing." });
  }
  return {
    byteLength: bytes.length || Math.ceil(value.toString(16).length / 2),
    layout: { label: sandbox.title },
    diagnostics,
  };
}

export async function analyzeSerializationPayload(sandbox, hexInput, layoutId = null) {
  const wasm = await loadSerializationWasm();
  if (sandbox.codec === "type-alignment") {
    return { wasm, ...analyzeTypeAlignment(sandbox, arguments[1] || "", arguments[2] || "") };
  }
  const bytes = bytesFromHex(hexInput);
  const layout = sandbox.layouts.find((item) => item.id === layoutId) || sandbox.layouts[0];
  let parsed;
  if (sandbox.codec === "rlp") parsed = parseRlpItem(bytes);
  else if (sandbox.codec === "cbor") parsed = parseCborItem(bytes);
  else if (sandbox.codec === "scale") parsed = { kind: "scale-layout", offset: 0, length: bytes.length, children: [] };
  else throw new Error(`Unsupported codec ${sandbox.codec}.`);
  if (parsed.length !== bytes.length && sandbox.codec !== "scale") throw new Error(`${sandbox.codec.toUpperCase()} root consumed ${parsed.length} of ${bytes.length} byte(s); trailing bytes begin at ${parsed.length}.`);
  const diagnostics = evaluateLayout(layout, parsed, bytes, sandbox.codec);
  return { wasm, byteLength: bytes.length, layout, parsed, diagnostics };
}
