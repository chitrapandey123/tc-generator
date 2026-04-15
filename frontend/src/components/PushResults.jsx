export default function PushResults({ results, onReset }) {
  const success = results.filter((r) => r.status === "success");
  const failed = results.filter((r) => r.status === "failed");

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "1.5rem" }}>
        {[
          { label: "Created in Xray", value: success.length, bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
          { label: "Failed", value: failed.length, bg: failed.length > 0 ? "#fef2f2" : "#f8fafc", color: failed.length > 0 ? "#b91c1c" : "#94a3b8", border: failed.length > 0 ? "#fecaca" : "#e2e8f0" },
          { label: "Total", value: results.length, bg: "#f8fafc", color: "#475569", border: "#e2e8f0" },
        ].map((m) => (
          <div key={m.label} style={{ background: m.bg, border: `1px solid ${m.border}`, borderRadius: "10px", padding: "16px", textAlign: "center" }}>
            <div style={{ fontSize: "28px", fontWeight: 700, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: "12px", color: m.color, marginTop: "2px" }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Results list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "1.5rem" }}>
        {results.map((r, idx) => (
          <div key={idx} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "11px 14px", borderRadius: "10px",
            background: r.status === "success" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${r.status === "success" ? "#bbf7d0" : "#fecaca"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0,
                background: r.status === "success" ? "#22c55e" : "#ef4444",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  {r.status === "success"
                    ? <polyline points="2,5 4,7 8,3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    : <><line x1="3" y1="3" x2="7" y2="7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="3" x2="3" y2="7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></>
                  }
                </svg>
              </div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a" }}>{r.title}</div>
                {r.status === "failed" && r.error && (
                  <div style={{ fontSize: "11px", color: "#b91c1c", marginTop: "2px" }}>{r.error}</div>
                )}
              </div>
            </div>
            {r.status === "success" && r.key && (
              <a href={r.url} target="_blank" rel="noreferrer" style={{
                fontSize: "12px", fontFamily: "monospace", fontWeight: 600,
                color: "#1d4ed8", background: "#dbeafe", padding: "3px 8px",
                borderRadius: "5px", flexShrink: 0,
              }}>
                {r.key} ↗
              </a>
            )}
          </div>
        ))}
      </div>

      <button onClick={onReset} style={ghostBtn}>← Start over</button>
    </div>
  );
}

const ghostBtn = { padding: "7px 14px", fontSize: "13px", fontWeight: 500, border: "1px solid #e2e8f0", borderRadius: "7px", background: "transparent", cursor: "pointer", color: "#475569" };
