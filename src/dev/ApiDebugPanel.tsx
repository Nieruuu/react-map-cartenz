import React from "react";
import { login, logout } from "../lib/api/auth";
import {
  getRaw,
  getAccessToken,
  getTokenType,
  setTokenType,
  setAccessToken,
} from "../lib/api/client";
import { API_BASE_URL, DEFAULT_USER, DEFAULT_PASS } from "../lib/config";

type Log = {
  when: string;
  step: string;
  url?: string;
  status?: number;
  body?: string;
  err?: string;
};

function now() {
  const d = new Date();
  return d.toLocaleTimeString();
}
function clip(s: any, n = 800) {
  try {
    const t = typeof s === "string" ? s : JSON.stringify(s);
    return t.length > n ? t.slice(0, n) + "…" : t;
  } catch {
    return String(s).slice(0, n);
  }
}

export default function ApiDebugPanel() {
  const [logs, setLogs] = React.useState<Log[]>([]);
  const [user, setUser] = React.useState(DEFAULT_USER || "sa");
  const [pass, setPass] = React.useState(DEFAULT_PASS || "");
  const [id, setId] = React.useState("220");
  const [rawPath, setRawPath] = React.useState(
    "/spatial-feature?page[number]=1&include[]=attribute"
  );
  const [scheme, setScheme] = React.useState(
    (getTokenType() || "jws") as "jws" | "Bearer"
  );
  const [token, setToken] = React.useState(getAccessToken() || "");
  const [busy, setBusy] = React.useState(false);
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    setToken(getAccessToken() || "");
    setScheme((getTokenType() || "jws") as any);
  }, []);

  function push(l: Partial<Log>) {
    setLogs((prev) =>
      [
        {
          when: now(),
          step: l.step || "",
          url: l.url,
          status: l.status,
          body: l.body,
          err: l.err,
        },
        ...prev,
      ].slice(0, 100)
    );
  }

  async function doLogin() {
    try {
      setBusy(true);
      const res = await login(user, pass, scheme);
      setScheme((res as any)?.data?.tokenType || scheme);
      const tk = getAccessToken() || "";
      setToken(tk);
      push({
        step: "AUTH /auth/request-token",
        status: 200,
        body: clip(res.data),
      });
    } catch (e: any) {
      push({ step: "AUTH /auth/request-token", err: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function doGetRaw(label: string, path: string) {
    try {
      setBusy(true);
      const { data, __meta } = await getRaw<any>(path);
      push({
        step: label,
        url: __meta.url,
        status: __meta.status,
        body: clip(data),
      });
    } catch (e: any) {
      push({ step: label, url: e?.url, err: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  function copy(s: string) {
    navigator.clipboard?.writeText(s);
  }
  function clearLocal() {
    logout();
    setToken("");
    setScheme("jws");
    push({ step: "LOGOUT/CLEAR TOKEN", body: "cleared localStorage" });
  }
  function applyScheme(next: "jws" | "Bearer") {
    setScheme(next);
    setTokenType(next);
    push({ step: "SET TOKEN TYPE", body: next });
  }
  function applyToken(next: string) {
    setToken(next);
    setAccessToken(next);
    push({ step: "SET TOKEN", body: `${next.slice(0, 16)}…` });
  }

  const baseNote = `BASE=${API_BASE_URL}  Authorization scheme=${scheme}`;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #ddd",
        padding: 10,
        borderRadius: 8,
        boxShadow: "0 2px 10px rgba(0,0,0,.1)",
        width: 420,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>API Debug Panel</div>
      <div style={{ color: "#555", fontSize: 12, marginBottom: 8 }}>
        {baseNote}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "90px 1fr",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <label>user</label>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          style={{ padding: 6, border: "1px solid #ccc", borderRadius: 4 }}
        />
        <label>password</label>
        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          type="password"
          style={{ padding: 6, border: "1px solid #ccc", borderRadius: 4 }}
        />
        <label>scheme</label>
        <select
          value={scheme}
          onChange={(e) => applyScheme(e.target.value as any)}
          style={{ padding: 6, border: "1px solid #ccc", borderRadius: 4 }}
        >
          <option value="jws">jws</option>
          <option value="Bearer">Bearer</option>
        </select>
        <label>token</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={token}
            onChange={(e) => applyToken(e.target.value)}
            style={{
              flex: 1,
              padding: 6,
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          />
          <button onClick={() => copy(token)} style={{ padding: "6px 8px" }}>
            Copy
          </button>
          <button
            onClick={() => setShow((s) => !s)}
            style={{ padding: "6px 8px" }}
          >
            {show ? "Hide" : "Reveal"}
          </button>
        </div>
        <label></label>
        <div style={{ color: "#777", fontFamily: "monospace", fontSize: 12 }}>
          {token
            ? show
              ? token
              : `${token.slice(0, 16)}…${token.slice(-6)}`
            : "(no token)"}
        </div>
      </div>

      <div
        style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}
      >
        <button
          disabled={busy}
          onClick={doLogin}
          style={{
            padding: "6px 10px",
            border: "1px solid #555",
            borderRadius: 4,
          }}
        >
          {busy ? "..." : "Request Token"}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            doGetRaw(
              "GET list (raw include[])",
              "/spatial-feature?include[]=attribute&page[number]=1"
            )
          }
          style={{
            padding: "6px 10px",
            border: "1px solid #555",
            borderRadius: 4,
          }}
        >
          GET list (include[])
        </button>
        <button
          disabled={busy}
          onClick={() => doGetRaw("GET count", "/spatial-feature/count")}
          style={{
            padding: "6px 10px",
            border: "1px solid #555",
            borderRadius: 4,
          }}
        >
          GET count
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            style={{
              width: 82,
              padding: 6,
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          />
          <button
            disabled={busy}
            onClick={() =>
              doGetRaw(
                `GET one id=${id}`,
                `/spatial-feature/${id}?include[]=attribute`
              )
            }
            style={{
              padding: "6px 10px",
              border: "1px solid #555",
              borderRadius: 4,
            }}
          >
            GET one
          </button>
        </div>
        <button
          disabled={busy}
          onClick={clearLocal}
          style={{
            padding: "6px 10px",
            border: "1px solid #c33",
            color: "#c33",
            borderRadius: 4,
          }}
        >
          Clear Token
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Raw GET path</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={rawPath}
              onChange={(e) => setRawPath(e.target.value)}
              style={{
                flex: 1,
                padding: 6,
                border: "1px solid #ccc",
                borderRadius: 4,
              }}
            />
            <button
              disabled={busy}
              onClick={() => doGetRaw("GET raw (custom)", rawPath)}
              style={{
                padding: "6px 10px",
                border: "1px solid #555",
                borderRadius: 4,
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          borderTop: "1px solid #eee",
          paddingTop: 8,
          maxHeight: 260,
          overflow: "auto",
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        {logs.map((l, i) => (
          <div
            key={i}
            style={{ padding: "6px 0", borderBottom: "1px solid #f3f3f3" }}
          >
            <div>
              <b>{l.when}</b> — {l.step}
            </div>
            {l.url && <div style={{ color: "#555" }}>{l.url}</div>}
            {typeof l.status === "number" && (
              <div
                style={{
                  color: l.status >= 200 && l.status < 300 ? "#060" : "#b00",
                }}
              >
                status {l.status}
              </div>
            )}
            {l.err ? (
              <div style={{ color: "#b00" }}>{l.err}</div>
            ) : l.body ? (
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{l.body}</pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
