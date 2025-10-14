import React from "react";

export default function TokenDebugger() {
  const [tokenInfo, setTokenInfo] = React.useState<{
    token: string | null;
    tokenType: string | null;
    expireAt: string | null;
    isExpired: boolean;
    timeLeft: string;
  } | null>(null);

  const checkToken = () => {
    const token = localStorage.getItem("ret_access_token");
    const tokenType = localStorage.getItem("ret_token_type");
    const expireAtStr = localStorage.getItem("ret_token_exp");

    const expireAt = expireAtStr ? parseInt(expireAtStr, 10) : null;
    const now = Date.now();
    const isExpired = expireAt ? expireAt < now : false;

    let timeLeft = "";
    if (expireAt && !isExpired) {
      const diff = expireAt - now;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      timeLeft = `${hours}h ${minutes}m`;
    } else if (isExpired) {
      timeLeft = "Expired";
    } else {
      timeLeft = "Unknown";
    }

    setTokenInfo({
      token,
      tokenType,
      expireAt: expireAtStr,
      isExpired,
      timeLeft,
    });
  };

  const clearTokens = () => {
    localStorage.removeItem("ret_access_token");
    localStorage.removeItem("ret_token_type");
    localStorage.removeItem("ret_token_exp");
    setTokenInfo(null);
  };

  const testToken = async () => {
    if (!tokenInfo?.token) {
      alert("No token to test");
      return;
    }

    try {
      const response = await fetch("/api/spatial-feature?include[]=attribute", {
        method: "GET",
        headers: {
          Authorization: `${tokenInfo.tokenType} ${tokenInfo.token}`,
          Accept: "*/*",
        },
      });

      const text = await response.text();

      if (response.ok) {
        alert(`Success! Response length: ${text.length} characters`);
      } else {
        alert(`Error ${response.status}: ${text.slice(0, 200)}`);
      }
    } catch (error) {
      alert(`Network error: ${error}`);
    }
  };

  React.useEffect(() => {
    checkToken();
  }, []);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #ddd",
        padding: 12,
        borderRadius: 6,
        fontSize: "12px",
        fontFamily: "monospace",
        maxWidth: "400px",
      }}
    >
      <h4 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>Token Debugger</h4>

      <div style={{ marginBottom: 8 }}>
        <button
          onClick={checkToken}
          style={{
            padding: "4px 8px",
            fontSize: "11px",
            border: "1px solid #888",
            borderRadius: 3,
            marginRight: 4,
          }}
        >
          Refresh
        </button>
        <button
          onClick={clearTokens}
          style={{
            padding: "4px 8px",
            fontSize: "11px",
            border: "1px solid #888",
            borderRadius: 3,
            marginRight: 4,
          }}
        >
          Clear
        </button>
        <button
          onClick={testToken}
          style={{
            padding: "4px 8px",
            fontSize: "11px",
            border: "1px solid #888",
            borderRadius: 3,
            backgroundColor: "#e0f2fe",
          }}
        >
          Test API
        </button>
      </div>

      {tokenInfo ? (
        <div style={{ lineHeight: "1.4" }}>
          <div>
            <strong>Token:</strong>{" "}
            {tokenInfo.token
              ? `${tokenInfo.token.slice(0, 20)}...`
              : "Not found"}
          </div>
          <div>
            <strong>Type:</strong> {tokenInfo.tokenType || "Not set"}
          </div>
          <div>
            <strong>Expires:</strong>{" "}
            {tokenInfo.expireAt
              ? new Date(parseInt(tokenInfo.expireAt)).toLocaleString()
              : "Not set"}
          </div>
          <div>
            <strong>Status:</strong>{" "}
            <span
              style={{ color: tokenInfo.isExpired ? "#ef4444" : "#10b981" }}
            >
              {tokenInfo.isExpired ? "EXPIRED" : "Valid"}
            </span>
          </div>
          <div>
            <strong>Time Left:</strong> {tokenInfo.timeLeft}
          </div>
        </div>
      ) : (
        <div style={{ color: "#666" }}>Click Refresh to check token status</div>
      )}

      <div
        style={{
          marginTop: 8,
          padding: 8,
          background: "#f8fafc",
          borderRadius: 4,
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>
          Console Commands:
        </div>
        <div style={{ fontSize: "11px" }}>
          <div>// Check token</div>
          <div>localStorage.getItem('ret_access_token')</div>
          <div style={{ marginTop: 4 }}>// Check token type</div>
          <div>localStorage.getItem('ret_token_type')</div>
          <div style={{ marginTop: 4 }}>// Check expiration</div>
          <div>localStorage.getItem('ret_token_exp')</div>
        </div>
      </div>
    </div>
  );
}
