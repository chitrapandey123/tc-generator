export default function PushResults({ results, onReset }) {
  const success = results.filter((r) => r.status === "success");
  const failed = results.filter((r) => r.status === "failed");

  return (
    <div>
      <div style={{ display: "flex", gap: "12px", marginBottom: "1.5rem" }}>
        <div style={metricCard("#dcfce7", "#16a34a")}>
          <div style={{ fontSize: "28px", fontWeight: 700 }}>{success.length}</div>
          <div style={{ fontSize: "13px" }}>Created in Xray</div>
        </div>
        <div style={metricCard("#fee2e2", "#dc2626")}>
          <div style={{ fontSize: "28px", fontWeight: 700 }}>{failed.length}</div>
          <div style={{ fontSize: "13px" }}>Failed</div>
        </div>
        <div style={metricCard("#f1f5f9", "#475569")}>
          <div style={{ fontSize: "28px", fontWeight: 700 }}>{results.length}</div>
          <div style={{ fontSize: "13px" }}>Total</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1.5rem" }}>
        {results.map((r, idx) => (
          <div key={idx} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderRadius: "10px",
            background: r.status === "success" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${r.status === "success" ? "#bbf7d0" : "#fecaca"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "16px" }}>{r.status === "success" ? "✅" : "❌"}</span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#1e293b" }}>{r.title}</div>
                {r.status === "failed" && (
                  <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "2px" }}>{r.error}</div>
                )}
              </div>
            </div>
            {r.status === "success" && (
              <a href={r.url} target="_blank" rel="noreferrer"
                style={{ fontSize: "12px", fontFamily: "monospace", color: "#3b82f6", textDecoration: "none", fontWeight: 600 }}>
                {r.key} ↗
              </a>
            )}
          </div>
        ))}
      </div>

      <button onClick={onReset} style={btnStyle}>
        ← Start over
      </button>
    </div>
  );
}

const metricCard = (bg, color) => ({
  flex: 1, padding: "16px", borderRadius: "10px",
  background: bg, color, textAlign: "center",
});
const btnStyle = {
  padding: "8px 16px", fontSize: "13px", fontWeight: 500,
  border: "1px solid #e2e8f0", borderRadius: "8px",
  background: "transparent", cursor: "pointer",
};
