import { useState } from "react";
import StoriesList from "./components/StoriesList";
import ReviewTC from "./components/ReviewTC";
import PushResults from "./components/PushResults";
import { fetchStories, generateTCs, getXrayToken, pushToXray } from "./api";

const STEPS = ["Connect", "Select Stories", "Review TCs", "Push to Xray"];

export default function App() {
  const [step, setStep] = useState(0);
  const [project, setProject] = useState("QA");
  const [stories, setStories] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [pushResults, setPushResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFetch = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStories(project);
      setStories(data.stories);
      setStep(1);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (selectedStories) => {
    setLoading(true);
    setError("");
    try {
      const data = await generateTCs(selectedStories);
      setTestCases(data.test_cases);
      setStep(2);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async (payload) => {
    setLoading(true);
    setError("");
    const allResults = [];
    try {
      const token = await getXrayToken();
      for (const story of payload) {
        if (story.testCases.length === 0) continue;
        const result = await pushToXray(project, story.storyKey, story.testCases, token);
        allResults.push(...result.results);
      }
      setPushResults(allResults);
      setStep(3);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(0);
    setStories([]);
    setTestCases([]);
    setPushResults([]);
    setError("");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
            TC Generator
          </h1>
          <p style={{ fontSize: "14px", color: "#64748b" }}>
            Fetch Jira stories → Generate test cases with AI → Push to Xray
          </p>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: "0", marginBottom: "2rem" }}>
          {STEPS.map((s, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  width: "28px", height: "28px", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "12px", fontWeight: 700,
                  background: idx < step ? "#22c55e" : idx === step ? "#1e293b" : "#e2e8f0",
                  color: idx <= step ? "#fff" : "#94a3b8",
                  flexShrink: 0,
                }}>
                  {idx < step ? "✓" : idx + 1}
                </div>
                <span style={{ fontSize: "13px", fontWeight: idx === step ? 600 : 400, color: idx === step ? "#1e293b" : "#94a3b8", whiteSpace: "nowrap" }}>
                  {s}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div style={{ flex: 1, height: "1px", background: idx < step ? "#22c55e" : "#e2e8f0", margin: "0 8px" }} />
              )}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", marginBottom: "1rem", fontSize: "13px", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "12px 16px", marginBottom: "1rem", fontSize: "13px", color: "#3b82f6" }}>
            {step === 0 && "Fetching stories from Jira..."}
            {step === 1 && "Generating test cases with Claude AI..."}
            {step === 2 && "Pushing test cases to Xray..."}
          </div>
        )}

        {/* Main card */}
        <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "1.5rem" }}>

          {/* Step 0: Connect */}
          {step === 0 && (
            <div>
              <h2 style={sectionTitle}>Connect to Jira</h2>
              <p style={sectionDesc}>Enter your project key to fetch stories.</p>
              <div style={{ maxWidth: "320px" }}>
                <label style={labelStyle}>Project Key</label>
                <input
                  value={project}
                  onChange={(e) => setProject(e.target.value.toUpperCase())}
                  placeholder="e.g. QA"
                  style={inputStyle}
                />
              </div>
              <button onClick={handleFetch} disabled={loading || !project} style={{ ...btnStyle, ...primaryBtn, marginTop: "1rem" }}>
                {loading ? "Fetching..." : "Fetch Stories →"}
              </button>
            </div>
          )}

          {/* Step 1: Select Stories */}
          {step === 1 && (
            <div>
              <h2 style={sectionTitle}>Select Stories</h2>
              <p style={sectionDesc}>Choose stories to generate test cases for.</p>
              <StoriesList stories={stories} onGenerate={handleGenerate} />
            </div>
          )}

          {/* Step 2: Review TCs */}
          {step === 2 && (
            <div>
              <h2 style={sectionTitle}>Review & Edit Test Cases</h2>
              <p style={sectionDesc}>Edit test cases before pushing to Xray. Uncheck any you want to skip.</p>
              <ReviewTC
                testCases={testCases}
                onPush={handlePush}
                onBack={() => setStep(1)}
              />
            </div>
          )}

          {/* Step 3: Push Results */}
          {step === 3 && (
            <div>
              <h2 style={sectionTitle}>Push Results</h2>
              <p style={sectionDesc}>Test cases have been pushed to Xray and linked to their stories.</p>
              <PushResults results={pushResults} onReset={handleReset} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const sectionTitle = { fontSize: "16px", fontWeight: 600, color: "#1e293b", marginBottom: "4px" };
const sectionDesc = { fontSize: "13px", color: "#64748b", marginBottom: "1.25rem" };
const labelStyle = { display: "block", fontSize: "13px", fontWeight: 500, color: "#475569", marginBottom: "6px" };
const inputStyle = { width: "100%", padding: "9px 12px", fontSize: "14px", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#1e293b", outline: "none" };
const btnStyle = { padding: "9px 20px", fontSize: "14px", fontWeight: 500, border: "1px solid #e2e8f0", borderRadius: "8px", background: "transparent", cursor: "pointer" };
const primaryBtn = { background: "#1e293b", color: "#fff", border: "none" };
