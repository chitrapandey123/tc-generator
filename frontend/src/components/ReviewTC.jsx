import { useState } from "react";

export default function ReviewTC({ testCases, onPush, onBack }) {
  const [tcs, setTcs] = useState(testCases);
  const [selected, setSelected] = useState(
    testCases.flatMap((story) => story.testCases.map((tc) => `${story.storyKey}-${tc.id}`))
  );

  const toggleTC = (storyKey, tcId) => {
    const key = `${storyKey}-${tcId}`;
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const updateTitle = (storyIdx, tcIdx, value) => {
    const updated = [...tcs];
    updated[storyIdx].testCases[tcIdx].title = value;
    setTcs(updated);
  };

  const updateStep = (storyIdx, tcIdx, stepIdx, field, value) => {
    const updated = [...tcs];
    updated[storyIdx].testCases[tcIdx].steps[stepIdx][field] = value;
    setTcs(updated);
  };

  const removeTC = (storyIdx, tcIdx) => {
    const updated = [...tcs];
    const tc = updated[storyIdx].testCases[tcIdx];
    updated[storyIdx].testCases.splice(tcIdx, 1);
    setTcs(updated);
    setSelected((prev) => prev.filter((k) => k !== `${updated[storyIdx].storyKey}-${tc.id}`));
  };

  const handlePush = () => {
    const payload = tcs.map((story) => ({
      storyKey: story.storyKey,
      testCases: story.testCases
        .filter((tc) => selected.includes(`${story.storyKey}-${tc.id}`))
        .map((tc) => ({
          title: tc.title,
          preconditions: tc.preconditions || "",
          steps: tc.steps,
        })),
    })).filter((s) => s.testCases.length > 0);
    onPush(payload);
  };

  const totalSelected = selected.length;
  const typeColor = (type) => {
    const map = { Positive: "#22c55e", Negative: "#f59e0b", "Edge Case": "#8b5cf6", Security: "#3b82f6", Performance: "#64748b" };
    return map[type] || "#64748b";
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <button onClick={onBack} style={btnStyle}>← Back to stories</button>
        <button
          onClick={handlePush}
          disabled={totalSelected === 0}
          style={{ ...btnStyle, ...primaryBtn, opacity: totalSelected === 0 ? 0.4 : 1 }}
        >
          Push {totalSelected} TC{totalSelected !== 1 ? "s" : ""} to Xray
        </button>
      </div>

      {tcs.map((story, sIdx) => (
        <div key={story.storyKey} style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#64748b", marginBottom: "10px" }}>
            <span style={{ fontFamily: "monospace" }}>{story.storyKey}</span> — {story.storySummary}
          </div>

          {story.testCases.map((tc, tIdx) => {
            const isSelected = selected.includes(`${story.storyKey}-${tc.id}`);
            return (
              <div key={tc.id} style={{ ...cardStyle, borderColor: isSelected ? "#3b82f6" : "#e2e8f0", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleTC(story.storyKey, tc.id)}
                    style={{ marginTop: "4px", cursor: "pointer" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <input
                        value={tc.title}
                        onChange={(e) => updateTitle(sIdx, tIdx, e.target.value)}
                        style={inputStyle}
                      />
                      <div style={{ display: "flex", gap: "6px", marginLeft: "8px", flexShrink: 0 }}>
                        <span style={{ ...tagStyle, background: typeColor(tc.type) + "20", color: typeColor(tc.type) }}>{tc.type}</span>
                        <span style={{ ...tagStyle, background: "#f1f5f9", color: "#475569" }}>{tc.priority}</span>
                        <button onClick={() => removeTC(sIdx, tIdx)} style={{ ...btnStyle, padding: "3px 8px", fontSize: "12px", color: "#ef4444", borderColor: "#fecaca" }}>✕</button>
                      </div>
                    </div>

                    {tc.preconditions && (
                      <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                        <strong>Preconditions:</strong> {tc.preconditions}
                      </p>
                    )}

                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={thStyle}>Action</th>
                          <th style={thStyle}>Data</th>
                          <th style={thStyle}>Expected Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tc.steps.map((step, stepIdx) => (
                          <tr key={stepIdx}>
                            <td style={tdStyle}>
                              <input value={step.action} onChange={(e) => updateStep(sIdx, tIdx, stepIdx, "action", e.target.value)} style={cellInputStyle} />
                            </td>
                            <td style={tdStyle}>
                              <input value={step.data} onChange={(e) => updateStep(sIdx, tIdx, stepIdx, "data", e.target.value)} style={cellInputStyle} />
                            </td>
                            <td style={tdStyle}>
                              <input value={step.result} onChange={(e) => updateStep(sIdx, tIdx, stepIdx, "result", e.target.value)} style={cellInputStyle} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const btnStyle = { padding: "8px 16px", fontSize: "13px", fontWeight: 500, border: "1px solid #e2e8f0", borderRadius: "8px", background: "transparent", cursor: "pointer" };
const primaryBtn = { background: "#1e293b", color: "#fff", border: "none" };
const cardStyle = { border: "1.5px solid", borderRadius: "10px", padding: "14px" };
const tagStyle = { fontSize: "11px", padding: "2px 8px", borderRadius: "4px", fontWeight: 500 };
const inputStyle = { flex: 1, width: "100%", fontSize: "13px", fontWeight: 500, border: "1px solid #e2e8f0", borderRadius: "6px", padding: "6px 10px", color: "#1e293b" };
const cellInputStyle = { width: "100%", fontSize: "12px", border: "none", outline: "none", background: "transparent", color: "#334155" };
const thStyle = { padding: "6px 10px", textAlign: "left", color: "#64748b", fontWeight: 600, border: "1px solid #e2e8f0" };
const tdStyle = { padding: "6px 10px", border: "1px solid #e2e8f0", verticalAlign: "top" };
