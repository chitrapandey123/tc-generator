import { useState, useEffect } from "react";
import { fetchExistingTests } from "../api";

export default function StoriesList({ stories, onGenerate, jiraDomain }) {
  const [selected, setSelected] = useState([]);
  const [expanded, setExpanded] = useState([]);
  const [existingTCs, setExistingTCs] = useState({});
  const [tcExpanded, setTcExpanded] = useState([]);
  const [loadingTCs, setLoadingTCs] = useState({});

  // Fetch existing TCs for all stories on load
  useEffect(() => {
    stories.forEach(async (story) => {
      setLoadingTCs((prev) => ({ ...prev, [story.key]: true }));
      try {
        const data = await fetchExistingTests(story.key);
        setExistingTCs((prev) => ({ ...prev, [story.key]: data }));
      } catch (e) {
        setExistingTCs((prev) => ({ ...prev, [story.key]: { tests: [], total: 0 } }));
      } finally {
        setLoadingTCs((prev) => ({ ...prev, [story.key]: false }));
      }
    });
  }, [stories]);

  const toggle = (key) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleExpand = (key, e) => {
    e.stopPropagation();
    setExpanded((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleTCExpand = (key, e) => {
    e.stopPropagation();
    setTcExpanded((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleAll = () => {
    setSelected(selected.length === stories.length ? [] : stories.map((s) => s.key));
  };

  const selectedStories = stories.filter((s) => selected.includes(s.key));

  const statusColor = (status) => {
    if (status === "Done") return { bg: "#dcfce7", color: "#15803d" };
    if (status === "In Progress") return { bg: "#fef3c7", color: "#b45309" };
    return { bg: "#f1f5f9", color: "#475569" };
  };

  const priorityColor = (priority) => {
    if (priority === "High") return { bg: "#fee2e2", color: "#b91c1c" };
    if (priority === "Medium") return { bg: "#fef3c7", color: "#b45309" };
    return { bg: "#f1f5f9", color: "#475569" };
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <span style={{ fontSize: "13px", color: "#64748b" }}>
          <span style={{ fontWeight: 500, color: "#0f172a" }}>{stories.length}</span> stories · <span style={{ fontWeight: 500, color: "#0f172a" }}>{selected.length}</span> selected
        </span>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={toggleAll} style={ghostBtn}>
            {selected.length === stories.length ? "Deselect all" : "Select all"}
          </button>
          <button
            onClick={() => onGenerate(selectedStories)}
            disabled={selected.length === 0}
            style={{ ...solidBtn, opacity: selected.length === 0 ? 0.4 : 1, cursor: selected.length === 0 ? "not-allowed" : "pointer" }}
          >
            Generate TCs →
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {stories.map((story) => {
          const isSelected = selected.includes(story.key);
          const isExpanded = expanded.includes(story.key);
          const isTCExpanded = tcExpanded.includes(story.key);
          const sc = statusColor(story.status);
          const pc = priorityColor(story.priority);
          const tcData = existingTCs[story.key];
          const tcCount = tcData?.total || 0;
          const isLoadingTC = loadingTCs[story.key];

          return (
            <div
              key={story.key}
              onClick={() => toggle(story.key)}
              style={{
                border: `1px solid ${isSelected ? "#3b82f6" : "#e2e8f0"}`,
                borderRadius: "10px",
                background: isSelected ? "#f0f7ff" : "#fff",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
                overflow: "hidden",
              }}
            >
              {/* Main row */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px" }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(story.key)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#3b82f6", flexShrink: 0 }}
                />
                <a
                  href={`https://${jiraDomain}/browse/${story.key}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: "12px", fontFamily: "monospace", color: "#3b82f6", flexShrink: 0, textDecoration: "none", borderBottom: "1px dashed #93c5fd" }}
                >
                  {story.key} ↗
                </a>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#0f172a", flex: 1 }}>{story.summary}</span>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                  {story.status && <span style={{ ...pill, background: sc.bg, color: sc.color }}>{story.status}</span>}
                  {story.priority && <span style={{ ...pill, background: pc.bg, color: pc.color }}>{story.priority}</span>}

                  {/* Existing TCs badge */}
                  {isLoadingTC ? (
                    <span style={{ ...pill, background: "#f1f5f9", color: "#94a3b8" }}>...</span>
                  ) : tcCount > 0 ? (
                    <button
                      onClick={(e) => toggleTCExpand(story.key, e)}
                      style={{ ...pill, background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0", cursor: "pointer" }}
                    >
                      ✓ {tcCount} TC{tcCount !== 1 ? "s" : ""} {isTCExpanded ? "▲" : "▼"}
                    </button>
                  ) : (
                    <span style={{ ...pill, background: "#f1f5f9", color: "#94a3b8" }}>No TCs</span>
                  )}

                  <button
                    onClick={(e) => toggleExpand(story.key, e)}
                    style={{ ...ghostBtn, padding: "3px 8px", fontSize: "11px", color: "#64748b" }}
                  >
                    {isExpanded ? "▲ Less" : "▼ More"}
                  </button>
                </div>
              </div>

              {/* Existing TCs list */}
              {isTCExpanded && tcData?.tests?.length > 0 && (
                <div
                  style={{ borderTop: "1px solid #e2e8f0", padding: "10px 14px", background: "#f0fdf4" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                    Existing test cases in Xray
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {tcData.tests.map((tc) => (
                      <div key={tc.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <a
                          href={`https://${jiraDomain}/browse/${tc.key}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: "11px", fontFamily: "monospace", color: "#1d4ed8", background: "#dbeafe", padding: "2px 6px", borderRadius: "4px", textDecoration: "none", flexShrink: 0 }}
                        >
                          {tc.key} ↗
                        </a>
                        <span style={{ fontSize: "12px", color: "#334155" }}>{tc.summary}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Expanded story details */}
              {isExpanded && (
                <div
                  style={{ borderTop: "1px solid #e2e8f0", padding: "12px 14px 14px 41px", background: "#fafbfc" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {story.assignee && (
                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                      <span style={{ fontWeight: 500 }}>Assignee:</span> {story.assignee}
                    </div>
                  )}
                  {story.description ? (
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Description</div>
                      <div style={{ fontSize: "13px", color: "#334155", lineHeight: "1.8" }}>
                        {story.description.split("\n").map((line, i) => {
                          const isBullet = line.startsWith("•");
                          const isNum = /^\d+\./.test(line);
                          const isAC = line.toLowerCase().includes("acceptance criteria");
                          return line.trim() ? (
                            <div key={i} style={{
                              marginBottom: isBullet || isNum ? "3px" : "6px",
                              paddingLeft: isBullet || isNum ? "8px" : "0",
                              fontWeight: isAC ? 600 : 400,
                              color: isAC ? "#0f172a" : "#334155",
                              borderLeft: isAC ? "3px solid #3b82f6" : "none",
                              paddingTop: isAC ? "4px" : "0",
                              marginTop: isAC ? "8px" : "0",
                            }}>
                              {line}
                            </div>
                          ) : <div key={i} style={{ height: "4px" }} />;
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>No description provided.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const pill = { fontSize: "11px", fontWeight: 500, padding: "2px 8px", borderRadius: "20px" };
const ghostBtn = { padding: "6px 12px", fontSize: "13px", fontWeight: 500, border: "1px solid #e2e8f0", borderRadius: "7px", background: "transparent", cursor: "pointer", color: "#475569" };
const solidBtn = { padding: "6px 16px", fontSize: "13px", fontWeight: 500, border: "none", borderRadius: "7px", background: "#0f172a", color: "#fff" };
