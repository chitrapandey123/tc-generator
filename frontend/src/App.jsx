import { useState } from "react";
import StoriesList from "./components/StoriesList";
import ReviewTC from "./components/ReviewTC";
import PushResults from "./components/PushResults";
import { fetchStories, generateTCs, getXrayToken, pushToXray } from "./api";

const STEPS = [
  { label: "Connect", desc: "Set up project" },
  { label: "Stories", desc: "Select stories" },
  { label: "Review", desc: "Edit test cases" },
  { label: "Push", desc: "Send to Xray" },
];

export default function App() {
  const [step, setStep] = useState(0);
  const [project, setProject] = useState("QA");
  const [stories, setStories] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [pushResults, setPushResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [jiraDomain, setJiraDomain] = useState("");

  const handleFetch = async () => {
    setLoading(true); setError(""); setLoadingMsg("Fetching stories from Jira...");
    try {
      const data = await fetchStories(project);
      setStories(data.stories);
      if (data.jira_domain) setJiraDomain(data.jira_domain);
      setStep(1);
    } catch (e) { setError(e.response?.data?.detail || e.message); }
    finally { setLoading(false); setLoadingMsg(""); }
  };

  const handleGenerate = async (selectedStories) => {
    setLoading(true); setError(""); setLoadingMsg("Claude is generating test cases...");
    try {
      const data = await generateTCs(selectedStories);
      setTestCases(data.test_cases);
      setStep(2);
    } catch (e) { setError(e.response?.data?.detail || e.message); }
    finally { setLoading(false); setLoadingMsg(""); }
  };

  const handlePush = async (payload) => {
    setLoading(true); setError(""); setLoadingMsg("Pushing test cases to Xray...");
    const allResults = [];
    try {
      const token = await getXrayToken();
      for (const story of payload) {
        if (!story.testCases.length) continue;
        const result = await pushToXray(project, story.storyKey, story.testCases, token);
        allResults.push(...result.results);
      }
      setPushResults(allResults);
      setStep(3);
    } catch (e) { setError(e.response?.data?.detail || e.message); }
    finally { setLoading(false); setLoadingMsg(""); }
  };

  const handleReset = () => {
    setStep(0); setStories([]); setTestCases([]); setPushResults([]); setError("");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>

      {/* Top nav */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 2rem" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "28px", height: "28px", background: "#0f172a", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="#fff" opacity="0.9"/>
                <rect x="8" y="1" width="5" height="5" rx="1" fill="#fff" opacity="0.6"/>
                <rect x="1" y="8" width="5" height="5" rx="1" fill="#fff" opacity="0.6"/>
                <rect x="8" y="8" width="5" height="5" rx="1" fill="#3b82f6"/>
              </svg>
            </div>
            <span style={{ fontSize: "15px", fontWeight: 600, color: "#0f172a" }}>TC Generator</span>
          </div>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>Jira · Claude AI · Xray</span>
        </div>
      </div>

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem 1rem" }}>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "2rem" }}>
          {STEPS.map((s, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", flex: idx < STEPS.length - 1 ? 1 : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "12px", fontWeight: 700,
                  background: idx < step ? "#0f172a" : idx === step ? "#3b82f6" : "#e2e8f0",
                  color: idx <= step ? "#fff" : "#94a3b8",
                }}>
                  {idx < step ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : idx + 1}
                </div>
                <div style={{ display: idx === step ? "block" : "none" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>{s.label}</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>{s.desc}</div>
                </div>
                {idx !== step && (
                  <span style={{ fontSize: "12px", color: idx < step ? "#64748b" : "#94a3b8", fontWeight: idx < step ? 500 : 400 }}>{s.label}</span>
                )}
              </div>
              {idx < STEPS.length - 1 && (
                <div style={{ flex: 1, height: "1px", background: idx < step ? "#0f172a" : "#e2e8f0", margin: "0 10px" }} />
              )}
            </div>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "11px 14px", marginBottom: "1rem", fontSize: "13px", color: "#b91c1c", display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="7" cy="7" r="6" stroke="#b91c1c" strokeWidth="1.5"/>
              <line x1="7" y1="4" x2="7" y2="7.5" stroke="#b91c1c" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="7" cy="9.5" r="0.75" fill="#b91c1c"/>
            </svg>
            {error}
          </div>
        )}

        {/* Loading banner */}
        {loading && (
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "11px 14px", marginBottom: "1rem", fontSize: "13px", color: "#1d4ed8", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "14px", height: "14px", border: "2px solid #bfdbfe", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }}/>
            {loadingMsg}
          </div>
        )}

        {/* Main card */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "1.5rem" }}>

          {/* Step 0 — Connect */}
          {step === 0 && (
            <div>
              {/* Hero */}
              <div style={{ textAlign: "center", padding: "2rem 1rem 2.5rem", borderBottom: "1px solid #f1f5f9", marginBottom: "2rem" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "20px", padding: "4px 12px", fontSize: "12px", color: "#1d4ed8", fontWeight: 500, marginBottom: "1rem" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#1d4ed8" strokeWidth="1.2"/><path d="M4 6l1.5 1.5L8 4" stroke="#1d4ed8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  AI-powered · Jira + Claude + Xray
                </div>
                <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#0f172a", marginBottom: "10px", letterSpacing: "-0.02em" }}>
                  Generate test cases in seconds
                </h1>
                <p style={{ fontSize: "15px", color: "#64748b", maxWidth: "420px", margin: "0 auto 2rem", lineHeight: "1.6" }}>
                  Fetch stories from Jira, let Claude AI write comprehensive test cases, and push them directly to Xray.
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", flexWrap: "wrap" }}>
                  {[
                    { icon: "J", label: "Jira stories", bg: "#dbeafe", color: "#1d4ed8" },
                    { arrow: true },
                    { icon: "✦", label: "Claude AI", bg: "#ede9fe", color: "#6d28d9" },
                    { arrow: true },
                    { icon: "X", label: "Xray tests", bg: "#dcfce7", color: "#15803d" },
                  ].map((item, i) =>
                    item.arrow ? (
                      <svg key={i} width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", background: item.bg, border: `1px solid ${item.color}30`, borderRadius: "8px", padding: "6px 12px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: item.color }}>{item.icon}</span>
                        <span style={{ fontSize: "12px", fontWeight: 500, color: item.color }}>{item.label}</span>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Form */}
              <div style={{ maxWidth: "360px", margin: "0 auto" }}>
                <label style={labelStyle}>Project key</label>
                <input
                  value={project}
                  onChange={(e) => setProject(e.target.value.toUpperCase())}
                  placeholder="e.g. QA"
                  onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                  style={{ ...inputStyle, fontSize: "15px", padding: "11px 14px", textAlign: "center", letterSpacing: "0.05em", fontWeight: 600 }}
                />
                <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px", textAlign: "center" }}>
                  Found in your Jira board URL: /projects/<strong style={{ color: "#475569" }}>{project || "KEY"}</strong>/boards
                </div>
                <button
                  onClick={handleFetch}
                  disabled={loading || !project}
                  style={{ ...solidBtn, width: "100%", marginTop: "1rem", padding: "11px", fontSize: "14px", opacity: loading || !project ? 0.5 : 1, borderRadius: "8px" }}
                >
                  {loading ? "Fetching stories..." : "Fetch stories from Jira →"}
                </button>
              </div>

              {/* Feature pills */}
              <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "2rem", flexWrap: "wrap" }}>
                {["Positive & negative cases", "Edge case coverage", "Security test cases", "Auto-linked to requirements"].map((f) => (
                  <span key={f} style={{ fontSize: "11px", color: "#64748b", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "20px", padding: "4px 10px" }}>{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Step 1 — Stories */}
          {step === 1 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
                <div style={sectionHead}>
                  <div style={sectionTitle}>Select stories</div>
                  <div style={sectionSub}>Choose stories to generate test cases for. Click ▼ to see full details.</div>
                </div>
                <button onClick={() => setStep(0)} style={{ ...ghostBtn, fontSize: "12px" }}>← Change project</button>
              </div>
              <StoriesList stories={stories} onGenerate={handleGenerate} jiraDomain={jiraDomain} />
            </div>
          )}

          {/* Step 2 — Review */}
          {step === 2 && (
            <div>
              <div style={sectionHead}>
                <div style={sectionTitle}>Review test cases</div>
                <div style={sectionSub}>Edit titles, preconditions, and steps. Uncheck any TCs you want to skip.</div>
              </div>
              <ReviewTC testCases={testCases} onPush={handlePush} onBack={() => setStep(1)} jiraDomain={jiraDomain} />
            </div>
          )}

          {/* Step 3 — Results */}
          {step === 3 && (
            <div>
              <div style={sectionHead}>
                <div style={sectionTitle}>Push results</div>
                <div style={sectionSub}>Test cases created in Xray and linked to their stories.</div>
              </div>
              <PushResults results={pushResults} onReset={handleReset} />
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus { outline: none; border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
      `}</style>
    </div>
  );
}

const sectionHead = { marginBottom: "1.25rem" };
const sectionTitle = { fontSize: "16px", fontWeight: 600, color: "#0f172a", marginBottom: "3px" };
const sectionSub = { fontSize: "13px", color: "#64748b" };
const labelStyle = { display: "block", fontSize: "13px", fontWeight: 500, color: "#374151", marginBottom: "6px" };
const inputStyle = { width: "100%", padding: "9px 12px", fontSize: "14px", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#0f172a", outline: "none" };
const ghostBtn = { padding: "6px 12px", fontSize: "13px", fontWeight: 500, border: "1px solid #e2e8f0", borderRadius: "7px", background: "transparent", cursor: "pointer", color: "#475569" };
const solidBtn = { padding: "8px 18px", fontSize: "13px", fontWeight: 500, border: "none", borderRadius: "7px", background: "#0f172a", color: "#fff", cursor: "pointer" };
