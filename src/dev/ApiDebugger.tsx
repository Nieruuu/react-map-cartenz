// src/dev/ApiDebugger.tsx
import React from "react";
import { API_BASE_URL, DEFAULT_USER, DEFAULT_PASS } from "../lib/config";
import {
  postNoAuth,
  getRaw,
  getAccessToken,
  setAccessToken,
  getTokenType,
  setTokenType,
  clearAccessToken,
} from "../lib/api/client";

type Mode = "list" | "count" | "single";

type LogRow = {
  step: string;
  url?: string;
  status?: number;
  body?: string;
  err?: string;
  at: string;
};

function now() {
  return new Date().toLocaleTimeString();
}
function clip(x: any, n = 800) {
  try {
    const s = typeof x === "string" ? x : JSON.stringify(x);
    return s.length > n ? s.slice(0, n) + "…" : s;
  } catch {
    return String(x).slice(0, n);
  }
}

// Samakan skema jadi 'Bearer' biar konsisten
function normalizeScheme(s: string | null | undefined): string {
  if (!s) return "Bearer";
  const k = s.toLowerCase();
  if (k === "jws" || k === "jwt" || k === "bearer") return "Bearer";
  return "Bearer";
}

// Build query list mentah (tanpa encode [])
function buildListQuery(
  page: number,
  size: number,
  includes: string[],
  filters: string[]
) {
  const parts: string[] = [];
  parts.push(`page[number]=${page}`);
  if (size) parts.push(`page[size]=${size}`);
  includes.forEach((v) => v && parts.push(`include[]=${v}`));
  filters.forEach((f) => f && parts.push(`filter[]=${f}`));
  return parts.join("&");
}

export default function ApiDebugger() {
  const [logs, setLogs] = React.useState<LogRow[]>([]);
  const [busy, setBusy] = React.useState(false);

  // Auth form
  const [user, setUser] = React.useState(DEFAULT_USER || "sa");
  const [pass, setPass] = React.useState(DEFAULT_PASS || "");

  // Token state
  const [token, setToken] = React.useState(getAccessToken() || "");
  const [scheme, setScheme] = React.useState(normalizeScheme(getTokenType()));

  // GET selector + params
  const [mode, setMode] = React.useState<Mode>("list");
  const [pageNumber, setPageNumber] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [includes, setIncludes] = React.useState("attribute");
  const [filters, setFilters] = React.useState(""); // newline: status|eq|1
  const [singleId, setSingleId] = React.useState("220");

  function push(row: Partial<LogRow>) {
    setLogs((prev) =>
      [
        {
          step: row.step || "",
          url: row.url,
          status: row.status,
          body: row.body,
          err: row.err,
          at: now(),
        },
        ...prev,
      ].slice(0, 140)
    );
  }

  // AUTH (tanpa Authorization header)
  async function doAuth() {
    try {
      setBusy(true);
      const { data, __meta } = await postNoAuth<{
        data: { tokenType: string; accessToken: string; expireAt: number };
      }>(
        "/auth/request-token",
        { userIdentifier: user, password: pass },
        undefined,
        { Accept: "*/*", "Content-Type": "application/json" }
      );
      const t = data.data?.accessToken || "";
      const ty = normalizeScheme(data.data?.tokenType);
      setToken(t);
      setAccessToken(t);
      setScheme(ty);
      setTokenType(ty); // simpan 'Bearer', bukan 'jws'
      push({
        step: "AUTH /auth/request-token",
        url: __meta.url,
        status: __meta.status,
        body: clip(data),
      });
    } catch (e: any) {
      push({ step: "AUTH /auth/request-token", err: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  function clearTok() {
    clearAccessToken();
    setToken("");
    setScheme("Bearer");
    push({ step: "CLEAR TOKEN", body: "local token cleared" });
  }

  // Path per mode
  function buildPathFor(m: Mode): string {
    if (m === "count") return "/spatial-feature/count";
    if (m === "single")
      return `/spatial-feature/${singleId}?include[]=attribute`;
    const inc = includes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const fil = filters
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const q = buildListQuery(pageNumber, pageSize, inc, fil);
    return `/spatial-feature?${q}`;
  }

  // GET (mode eksplisit biar nggak kejebak race setState)
  async function doGet(m?: Mode) {
    const modeToUse = m ?? mode;
    const path = buildPathFor(modeToUse);
    try {
      setBusy(true);
      const { data, __meta } = await getRaw<any>(path);
      push({
        step: `GET ${modeToUse}`,
        url: __meta.url,
        status: __meta.status,
        body: clip(data),
      });
    } catch (e: any) {
      push({
        step: `GET ${modeToUse}`,
        url: e?.url,
        err: e?.message || String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function doAuto() {
    try {
      setBusy(true);
      await doAuth();
      await new Promise((r) => setTimeout(r, 50));
      await doGet("list");
      await doGet("count");
      await doGet("single");
    } finally {
      setBusy(false);
    }
  }

  const tokenPreview = token
    ? `${scheme} ${token.slice(0, 16)}…${token.slice(-6)}`
    : "(no token)";

  return (
    <div
      style={{
        background: "#101114",
        color: "#e7e7e7",
        border: "1px solid #2a2b2f",
        borderRadius: 10,
        padding: 12,
        width: 460,
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>API Debugger</div>
      <div
        style={{ color: "#a6a8ad", marginBottom: 8, fontFamily: "monospace" }}
      >
        BASE {API_BASE_URL}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Auth</div>
        <div
          style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 6 }}
        >
          <label>user</label>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            style={{
              padding: 6,
              borderRadius: 6,
              border: "1px solid #333",
              background: "#15161a",
              color: "#e7e7e7",
            }}
          />
          <label>password</label>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            style={{
              padding: 6,
              borderRadius: 6,
              border: "1px solid #333",
              background: "#15161a",
              color: "#e7e7e7",
            }}
          />
        </div>
        <div
          style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <button
            onClick={doAuth}
            disabled={busy}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #4b4d55",
              background: "#1a1b20",
              color: "#e7e7e7",
            }}
          >
            Request Token
          </button>
          <button
            onClick={clearTok}
            disabled={busy}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #804",
              background: "#2a0f12",
              color: "#ffb3b3",
            }}
          >
            Clear Token
          </button>
        </div>
        <div
          style={{ marginTop: 6, fontFamily: "monospace", color: "#9bd97f" }}
        >
          token in use: {tokenPreview}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>GET options</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <label>
            <input
              type="radio"
              checked={mode === "list"}
              onChange={() => setMode("list")}
            />{" "}
            list
          </label>
          <label>
            <input
              type="radio"
              checked={mode === "count"}
              onChange={() => setMode("count")}
            />{" "}
            count
          </label>
          <label>
            <input
              type="radio"
              checked={mode === "single"}
              onChange={() => setMode("single")}
            />{" "}
            single by id
          </label>
        </div>

        {mode === "list" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "110px 1fr",
              gap: 6,
            }}
          >
            <label>page[number]</label>
            <input
              type="number"
              min={1}
              value={pageNumber}
              onChange={(e) =>
                setPageNumber(parseInt(e.target.value || "1", 10))
              }
              style={{
                padding: 6,
                borderRadius: 6,
                border: "1px solid #333",
                background: "#15161a",
                color: "#e7e7e7",
              }}
            />
            <label>page[size]</label>
            <input
              type="number"
              min={1}
              value={pageSize}
              onChange={(e) =>
                setPageSize(parseInt(e.target.value || "10", 10))
              }
              style={{
                padding: 6,
                borderRadius: 6,
                border: "1px solid #333",
                background: "#15161a",
                color: "#e7e7e7",
              }}
            />
            <label>include[]</label>
            <input
              placeholder="attribute, foo"
              value={includes}
              onChange={(e) => setIncludes(e.target.value)}
              style={{
                padding: 6,
                borderRadius: 6,
                border: "1px solid #333",
                background: "#15161a",
                color: "#e7e7e7",
              }}
            />
            <label>filter[]</label>
            <textarea
              placeholder={
                "status|eq|1\nattributes.attributeKeyValue|eq|kodeProvinsi$$51"
              }
              value={filters}
              onChange={(e) => setFilters(e.target.value)}
              rows={3}
              style={{
                padding: 6,
                borderRadius: 6,
                border: "1px solid #333",
                background: "#15161a",
                color: "#e7e7e7",
              }}
            />
          </div>
        )}

        {mode === "single" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "110px 1fr",
              gap: 6,
            }}
          >
            <label>id</label>
            <input
              value={singleId}
              onChange={(e) => setSingleId(e.target.value)}
              style={{
                padding: 6,
                borderRadius: 6,
                border: "1px solid #333",
                background: "#15161a",
                color: "#e7e7e7",
              }}
            />
          </div>
        )}

        <div
          style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <button
            onClick={() => doGet()}
            disabled={busy}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #4b4d55",
              background: "#1a1b20",
              color: "#e7e7e7",
            }}
          >
            GET Now
          </button>
          <button
            onClick={() => doAuto()}
            disabled={busy}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #4b4d55",
              background: "#10251a",
              color: "#b9fcb0",
            }}
          >
            Auto Test (AUTH→LIST→COUNT→ONE)
          </button>
        </div>

        <div
          style={{ marginTop: 6, fontFamily: "monospace", color: "#a6a8ad" }}
        >
          Preview URL: {API_BASE_URL}
          {buildPathFor(mode)}
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          borderTop: "1px solid #2a2b2f",
          paddingTop: 8,
          maxHeight: 260,
          overflow: "auto",
          fontFamily: "monospace",
        }}
      >
        {logs.map((l, i) => (
          <div
            key={i}
            style={{ padding: "6px 0", borderBottom: "1px dashed #2a2b2f" }}
          >
            <div>
              <b>{l.at}</b> — {l.step}
            </div>
            {l.url && <div style={{ color: "#8fb4ff" }}>{l.url}</div>}
            {typeof l.status === "number" && (
              <div
                style={{
                  color:
                    l.status >= 200 && l.status < 300 ? "#9bd97f" : "#ff9f9f",
                }}
              >
                status {l.status}
              </div>
            )}
            {l.err ? (
              <div style={{ whiteSpace: "pre-wrap", color: "#ff9f9f" }}>
                {l.err}
              </div>
            ) : l.body ? (
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{l.body}</pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
