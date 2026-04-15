import { useState } from "react";

export default function ReviewTC({ testCases, onPush, onBack, jiraDomain }) {
  const [tcs, setTcs] = useState(testCases);
  const [selected, setSelected] = useState(
    testCases.flatMap((story) => story.testCases.map((tc) => `${story.storyKey}-${tc.id}`))
  );
  const [expanded, setExpanded] = useState(
    testCases.flatMap((story) => story.testCases.map((tc) => `${story.storyKey}-${tc.id}`))
  );

  const toggleTC = (storyKey, tcId) => {
    const key = `${storyKey}-${tcId}`;
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const toggleExpand = (storyKey, tcId) => {
    const key = `${storyKey}-${tcId}`;
    setExpanded((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const update = (sIdx, tIdx, field, value) => {
    const updated = JSON.parse(JSON.stringify(tcs));
    updated[sIdx].testCases[tIdx][field] = value;
    setTcs(updated);
  };

  const updateStep = (sIdx, tIdx, stepIdx, field, value) => {
    const updated = JSON.parse(JSON.stringify(tcs));
    updated[sIdx].testCases[tIdx].steps[stepIdx][field] = value;
    setTcs(updated);
  };

  const addStep = (sIdx, tIdx) => {
    const updated = JSON.parse(JSON.stringify(tcs));
    updated[sIdx].testCases[tIdx].steps.push({ action: "", data: "", result: "" });
    setTcs(updated);
  };

  const deleteStep = (sIdx, tIdx, stepIdx) => {
    const updated = JSON.parse(JSON.stringify(tcs));
    updated[sIdx].testCases[tIdx].steps.splice(stepIdx, 1);
    setTcs(updated);
  };

  const removeTC = (sIdx, tIdx) => {
    const updated = JSON.parse(JSON.stringify(tcs));
    const tc = updated[sIdx].testCases[tIdx];
    const storyKey = updated[sIdx].storyKey;
    updated[sIdx].testCases.splice(tIdx, 1);
    setTcs(updated);
    setSelected((prev) => prev.filter((k) => k !== `${storyKey}-${tc.id}`));
  };

  const handlePush = () => {
    const payload = tcs.map((story) => ({
      storyKey: story.storyKey,
      testCases: story.testCases
        .filter((tc) => selected.includes(`${story.storyKey}-${tc.id}`))
        .map((tc) => ({
          title: tc.title,
          preconditions: tc.preconditions || "",
          description: tc.description || "",
          steps: tc.steps,
        })),
    })).filter((s) => s.testCases.length > 0);
    onPush(payload);
  };

  const totalSelected = selected.length;

  const typeStyle = (type) => {
    const map = {
      Positive: { bg: "#dcfce7", color: "#15803d" },
      Negative: { bg: "#fee2e2", color: "#b91c1c" },
      "Edge Case": { bg: "#ede9fe", color: "#6d28d9" },
      Security: { bg: "#dbeafe", color: "#1d4ed8" },
      Performance: { bg: "#f1f5f9", color: "#475569" },
    };
    return map[type] || { bg: "#f1f5f9", color: "#475569" };
  };

  const priorityStyle = (p) => {
    const map = {
      High: { bg: "#fee2e2", color: "#b91c1c" },
      Medium: { bg: "#fef3c7", color: "#b45309" },
      Low: { bg: "#f1f5f9", color: "#475569" },
    };
    return map[p] || { bg: "#f1f5f9", color: "#475569" };
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <button onClick={onBack} style={ghostBtn}>← Back</button>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            <span style={{ fontWeight: 500, color: "#0f172a" }}>{totalSelected}</span> TC{totalSelected !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={handlePush}
            disabled={totalSelected === 0}
            style={{ ...solidBtn, opacity: totalSelected === 0 ? 0.4 : 1, cursor: totalSelected === 0 ? "not-allowed" : "pointer" }}
          >
            Push to Xray →
          </button>
        </div>
      </div>

      {tcs.map((story, sIdx) => (
        <div key={story.storyKey} style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", paddingBottom: "8px", borderBottom: "1px solid #e2e8f0" }}>
            <a
              href={`https://${jiraDomain}/browse/${story.storyKey}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "12px", fontFamily: "monospace", background: "#eff6ff", color: "#1d4ed8", padding: "2px 7px", borderRadius: "5px", textDecoration: "none", border: "1px solid #bfdbfe" }}
            >
              {story.storyKey} ↗
            </a>
            <span style={{ fontSize: "14px", fontWeight: 500, color: "#0f172a" }}>{story.storySummary}</span>
            <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: "auto" }}>{story.testCases.length} test cases</span>
          </div>

          {story.testCases.map((tc, tIdx) => {
            const key = `${story.storyKey}-${tc.id}`;
            const isSelected = selected.includes(key);
            const isExpanded = expanded.includes(key);
            const ts = typeStyle(tc.type);
            const ps = priorityStyle(tc.priority);

            return (
              <div key={tc.id} style={{ border: `1px solid ${isSelected ? "#3b82f6" : "#e2e8f0"}`, borderRadius: "10px", marginBottom: "8px", background: "#fff", overflow: "hidden" }}>
                {/* TC header */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 14px" }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleTC(story.storyKey, tc.id)}
                    style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#3b82f6", flexShrink: 0 }}
                  />
                  <input
                    value={tc.title}
                    onChange={(e) => update(sIdx, tIdx, "title", e.target.value)}
                    style={{ flex: 1, fontSize: "13px", fontWeight: 500, border: "none", outline: "none", background: "transparent", color: "#0f172a" }}
                  />
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ ...pill, background: ts.bg, color: ts.color }}>{tc.type}</span>
                    <span style={{ ...pill, background: ps.bg, color: ps.color }}>{tc.priority}</span>
                    <button onClick={() => toggleExpand(story.storyKey, tc.id)} style={{ ...ghostBtn, padding: "3px 8px", fontSize: "11px" }}>
                      {isExpanded ? "▲" : "▼"}
                    </button>
                    <button onClick={() => removeTC(sIdx, tIdx)} style={{ ...ghostBtn, padding: "3px 8px", fontSize: "11px", color: "#ef4444", borderColor: "#fecaca" }}>✕</button>
                  </div>
                </div>

                {/* TC details */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 14px" }}>

                    {/* Description */}
                    <div style={{ marginBottom: "12px" }}>
                      <div style={labelStyle}>Description</div>
                      <textarea
                        value={tc.description || ""}
                        onChange={(e) => update(sIdx, tIdx, "description", e.target.value)}
                        placeholder="Brief description of what this test case verifies..."
                        rows={2}
                        style={{ width: "100%", fontSize: "13px", color: "#334155", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "7px 10px", outline: "none", resize: "vertical", background: "#fafbfc", fontFamily: "inherit" }}
                      />
                    </div>

                    {/* Preconditions */}
                    <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={labelStyle}>Preconditions</span>
                      <input
                        value={tc.preconditions || ""}
                        onChange={(e) => update(sIdx, tIdx, "preconditions", e.target.value)}
                        placeholder="Enter preconditions..."
                        style={{ flex: 1, fontSize: "13px", color: "#334155", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "6px 10px", outline: "none", background: "#fafbfc" }}
                      />
                    </div>

                    {/* Steps */}
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Steps</div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden", marginBottom: "8px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 2fr 28px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        {["Action", "Data", "Expected result", ""].map((h, i) => (
                          <div key={i} style={{ padding: "7px 12px", fontSize: "11px", fontWeight: 600, color: "#64748b" }}>{h}</div>
                        ))}
                      </div>
                      {tc.steps.map((step, stepIdx) => (
                        <div key={stepIdx} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 2fr 28px", borderBottom: stepIdx < tc.steps.length - 1 ? "1px solid #f1f5f9" : "none", alignItems: "center" }}>
                          {["action", "data", "result"].map((field) => (
                            <input
                              key={field}
                              value={step[field] || ""}
                              onChange={(e) => updateStep(sIdx, tIdx, stepIdx, field, e.target.value)}
                              placeholder={field === "data" ? "optional" : ""}
                              style={{ padding: "8px 12px", fontSize: "12px", border: "none", outline: "none", color: "#334155", background: "transparent", borderRight: "1px solid #f1f5f9" }}
                            />
                          ))}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <button
                              onClick={() => deleteStep(sIdx, tIdx, stepIdx)}
                              title="Delete step"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "13px", padding: "4px", lineHeight: 1 }}
                            >✕</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add step button */}
                    <button
                      onClick={() => addStep(sIdx, tIdx)}
                      style={{ ...ghostBtn, fontSize: "12px", padding: "5px 12px", color: "#3b82f6", borderColor: "#bfdbfe" }}
                    >
                      + Add step
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const pill = { fontSize: "11px", fontWeight: 500, padding: "2px 8px", borderRadius: "20px" };
const labelStyle = { fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px", display: "block" };
const ghostBtn = { padding: "6px 12px", fontSize: "13px", fontWeight: 500, border: "1px solid #e2e8f0", borderRadius: "7px", background: "transparent", cursor: "pointer", color: "#475569" };
const solidBtn = { padding: "6px 16px", fontSize: "13px", fontWeight: 500, border: "none", borderRadius: "7px", background: "#0f172a", color: "#fff" };
