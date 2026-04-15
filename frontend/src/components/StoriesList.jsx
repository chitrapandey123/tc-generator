import { useState } from "react";

export default function StoriesList({ stories, onGenerate }) {
  const [selected, setSelected] = useState([]);

  const toggle = (key) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleAll = () => {
    setSelected(selected.length === stories.length ? [] : stories.map((s) => s.key));
  };

  const selectedStories = stories.filter((s) => selected.includes(s.key));

  const statusColor = (status) => {
    if (status === "Done") return "#22c55e";
    if (status === "In Progress") return "#f59e0b";
    return "#94a3b8";
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <span style={{ fontSize: "14px", color: "#64748b" }}>
          {stories.length} stories found — {selected.length} selected
        </span>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={toggleAll} style={btnStyle}>
            {selected.length === stories.length ? "Deselect all" : "Select all"}
          </button>
          <button
            onClick={() => onGenerate(selectedStories)}
            disabled={selected.length === 0}
            style={{ ...btnStyle, ...primaryBtn, opacity: selected.length === 0 ? 0.4 : 1 }}
          >
            Generate TCs for {selected.length} {selected.length === 1 ? "story" : "stories"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {stories.map((story) => (
          <div
            key={story.key}
            onClick={() => toggle(story.key)}
            style={{
              ...cardStyle,
              borderColor: selected.includes(story.key) ? "#3b82f6" : "#e2e8f0",
              background: selected.includes(story.key) ? "#eff6ff" : "#fff",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <input
                type="checkbox"
                checked={selected.includes(story.key)}
                onChange={() => toggle(story.key)}
                onClick={(e) => e.stopPropagation()}
                style={{ marginTop: "3px", cursor: "pointer" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#64748b" }}>{story.key}</span>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "#1e293b" }}>{story.summary}</span>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ ...tagStyle, background: "#f1f5f9", color: "#475569" }}>{story.assignee}</span>
                  <span style={{ ...tagStyle, background: "#f1f5f9", color: statusColor(story.status) }}>
                    {story.status}
                  </span>
                  {story.priority && (
                    <span style={{ ...tagStyle, background: "#f1f5f9", color: "#475569" }}>{story.priority}</span>
                  )}
                </div>
                {story.description && (
                  <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>
                    {story.description.substring(0, 100)}{story.description.length > 100 ? "…" : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const btnStyle = {
  padding: "8px 16px", fontSize: "13px", fontWeight: 500,
  border: "1px solid #e2e8f0", borderRadius: "8px",
  background: "transparent", cursor: "pointer",
};
const primaryBtn = { background: "#1e293b", color: "#fff", border: "none" };
const cardStyle = { border: "1.5px solid", borderRadius: "10px", padding: "14px" };
const tagStyle = { fontSize: "11px", padding: "2px 8px", borderRadius: "4px", fontWeight: 500 };
