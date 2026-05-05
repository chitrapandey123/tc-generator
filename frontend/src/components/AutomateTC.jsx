import { useState, useEffect } from "react";
import { generatePlaywright, mergePlaywright, decideTestFile } from "../api";
import axios from "axios";

const BASE_URL = "http://localhost:8000";

export default function AutomateTC({ testCases, onBack, jiraDomain }) {
  const [githubToken, setGithubToken] = useState("");
  const [repo, setRepo] = useState("");
  const [repoConnected, setRepoConnected] = useState(false);
  const [testFiles, setTestFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [suggestedFile, setSuggestedFile] = useState("");
  const [createNew, setCreateNew] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState("connect"); // connect | select | generate | done
  const [fileDecisionReason, setFileDecisionReason] = useState("");

  const [selectedStoryIdx, setSelectedStoryIdx] = useState(testCases.length === 1 ? 0 : null);
  const [selectAll, setSelectAll] = useState(false);
  const [storySelectionDone, setStorySelectionDone] = useState(testCases.length === 1);

  const story = selectAll ? testCases[0] : (selectedStoryIdx !== null ? testCases[selectedStoryIdx] : testCases[0]);
  const allTCs = selectAll
    ? testCases.flatMap((s) => s.testCases.map((tc) => ({ ...tc, storyKey: s.storyKey })))
    : (story ? story.testCases.map((tc) => ({ ...tc, storyKey: story.storyKey })) : []);

  // Auto-suggest filename from story summary
  useEffect(() => {
    if (story?.storySummary) {
      const slug = story.storySummary
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .trim()
        .split(/\s+/)
        .slice(0, 5)
        .join("_");
      const suggested = `tests/test_${slug}.py`;
      setSuggestedFile(suggested);
      setFilename(`test_${slug}.py`);
    }
  }, [story]);

  const handleConnectRepo = async () => {
    setLoading(true);
    setError("");
    try {
      if (selectAll) {
        // For all stories — Claude decides file for each story separately (handled in push)
        setLoadingMsg("Scanning repository...");
        setSelectedFile("__all__");
        setCreateNew(false);
        setRepoConnected(true);
        setStep("select");
      } else {
        // Ask Claude to decide which file this story belongs to
        setLoadingMsg("Claude is deciding which test file to use...");
        const decision = await decideTestFile({
          github_token: githubToken,
          repo,
          story_key: story.storyKey,
          story_summary: story.storySummary,
          test_cases: allTCs,
        });

        const targetFile = decision.target_file;
        const exists = decision.exists;

        if (exists) {
          setTestFiles([targetFile]);
          setSelectedFile(targetFile);
          setCreateNew(false);
        } else {
          setTestFiles([]);
          setSelectedFile(targetFile);
          setSuggestedFile(targetFile);
          setCreateNew(true);
        }
        // Store reason to show user
        setFileDecisionReason(decision.reason || "");
        setRepoConnected(true);
        setStep("select");
      }
    } catch (e) {
      setError("Could not connect to repo. Check token and repo name.");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setLoadingMsg("Claude is generating Playwright Python code...");
    try {
      if (selectAll) {
        // Generate code for all stories combined
        const combinedSummary = testCases.map(s => s.storySummary).join(", ");
        const storyKey = testCases.map(s => s.storyKey).join("-");
        const data = await generatePlaywright({
          story_key: storyKey,
          story_summary: combinedSummary,
          test_cases: allTCs,
        });
        setGeneratedCode(data.code);
      } else {
        const data = await generatePlaywright({
          story_key: story.storyKey,
          story_summary: story.storySummary,
          test_cases: allTCs,
        });
        setGeneratedCode(data.code);
      }
      setStep("generate");
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  const handlePushToGitHub = async () => {
    setLoading(true);
    setError("");
    const branchStoryKey = selectAll ? testCases.map(s => s.storyKey).join("-") : story.storyKey;
    setLoadingMsg(`Pushing to branch tc-${branchStoryKey} — please wait...`);
    try {
      const filePath = createNew ? suggestedFile : selectedFile;
      const data = await mergePlaywright({
        github_token: githubToken,
        repo,
        branch: "main",
        file_path: filePath,
        generated_code: generatedCode,
        story_key: branchStoryKey,
        all_stories: selectAll ? testCases.map(s => ({ storyKey: s.storyKey, storySummary: s.storySummary, testCases: s.testCases })) : null,
      });
      setResult(data);
      setStep("done");
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  const copyToClipboard = (code) => navigator.clipboard.writeText(code);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1.5rem" }}>
        <button onClick={onBack} style={ghostBtn}>← Back to results</button>
      </div>

      {/* Progress */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "1.5rem", alignItems: "center" }}>
        {[
          { key: "connect", label: "Connect repo" },
          { key: "select", label: "Select file" },
          { key: "generate", label: "Generate code" },
          { key: "done", label: "Done" },
        ].map((s, i) => {
          const steps = ["connect", "select", "generate", "done"];
          const currentIdx = steps.indexOf(step);
          const thisIdx = steps.indexOf(s.key);
          const isDone = currentIdx > thisIdx;
          const isActive = currentIdx === thisIdx;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{
                width: "22px", height: "22px", borderRadius: "50%",
                background: isDone ? "#0f172a" : isActive ? "#3b82f6" : "#e2e8f0",
                color: isDone || isActive ? "#fff" : "#94a3b8",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "11px", fontWeight: 700, flexShrink: 0,
              }}>
                {isDone ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: "12px", color: isActive ? "#0f172a" : "#94a3b8", fontWeight: isActive ? 600 : 400 }}>{s.label}</span>
              {i < 3 && <div style={{ width: "24px", height: "1px", background: "#e2e8f0" }} />}
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", marginBottom: "1rem", fontSize: "13px", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "10px 14px", marginBottom: "1rem", fontSize: "13px", color: "#1d4ed8", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "14px", height: "14px", border: "2px solid #bfdbfe", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
          <span style={{ wordBreak: "break-all" }}>{loadingMsg}</span>
        </div>
      )}

      {/* Story selection — only shown when multiple stories */}
      {!storySelectionDone && testCases.length > 1 && (
        <div style={card}>
          <div style={cardTitle}>Which story do you want to automate?</div>
          <div style={cardSub}>Select one story to generate Playwright code for.</div>
          <div style={{ margin: "1rem 0", display: "flex", flexDirection: "column", gap: "8px" }}>

            {/* All stories option */}
            <label style={{ ...fileOption, borderColor: selectAll ? "#3b82f6" : "#e2e8f0", background: selectAll ? "#f0f7ff" : "#fff", cursor: "pointer" }}>
              <input type="radio" name="story" checked={selectAll}
                onChange={() => { setSelectAll(true); setSelectedStoryIdx(null); }}
                style={{ accentColor: "#3b82f6" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a" }}>All stories</div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                  {testCases.reduce((acc, s) => acc + s.testCases.length, 0)} test cases across {testCases.length} files — one branch for all
                </div>
              </div>
              <span style={{ fontSize: "11px", background: "#ede9fe", color: "#6d28d9", padding: "2px 8px", borderRadius: "20px" }}>recommended</span>
            </label>

            {/* Individual stories */}
            {testCases.map((s, idx) => (
              <label key={s.storyKey} style={{ ...fileOption, borderColor: !selectAll && selectedStoryIdx === idx ? "#3b82f6" : "#e2e8f0", background: !selectAll && selectedStoryIdx === idx ? "#f0f7ff" : "#fff", cursor: "pointer" }}>
                <input type="radio" name="story" checked={!selectAll && selectedStoryIdx === idx}
                  onChange={() => { setSelectAll(false); setSelectedStoryIdx(idx); }}
                  style={{ accentColor: "#3b82f6" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a" }}>
                    <span style={{ fontFamily: "monospace", background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", marginRight: "8px" }}>{s.storyKey}</span>
                    {s.storySummary}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>{s.testCases.length} test case{s.testCases.length !== 1 ? "s" : ""}</div>
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={() => setStorySelectionDone(true)}
            disabled={!selectAll && selectedStoryIdx === null}
            style={{ ...solidBtn, opacity: (!selectAll && selectedStoryIdx === null) ? 0.4 : 1 }}
          >
            Continue →
          </button>
        </div>
      )}

      {/* Step 1 — Connect Repo */}
      {storySelectionDone && step === "connect" && !loading && (
        <div style={card}>
          <div style={cardTitle}>Connect to GitHub</div>
          <div style={cardSub}>Enter your GitHub details to scan for existing test files.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", margin: "1rem 0" }}>
            <div>
              <label style={labelStyle}>GitHub token</label>
              <input value={githubToken} onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx" type="password" style={inputStyle} />
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                Needs repo read+write access
              </div>
            </div>
            <div>
              <label style={labelStyle}>Repository</label>
              <input value={repo} onChange={(e) => setRepo(e.target.value)}
                placeholder="username/playwright-python" style={inputStyle} />
            </div>
          </div>
          <button
            onClick={handleConnectRepo}
            disabled={!githubToken || !repo}
            style={{ ...solidBtn, opacity: (!githubToken || !repo) ? 0.4 : 1 }}
          >
            Connect & scan repo →
          </button>
        </div>
      )}

      {/* Step 2 — Select file */}
      {storySelectionDone && step === "select" && !loading && (
        <div style={card}>
          <div style={cardTitle}>Which file would you like to add the TCs to?</div>
          <div style={cardSub}>
            Adding {allTCs.length} test cases from <strong>{story.storyKey}</strong> — {story.storySummary}
          </div>

          <div style={{ margin: "1rem 0", display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* All stories mode — show each story separately */}
            {selectAll ? (
              <div>
                {testCases.map((s) => {
                  const sl = s.storySummary.toLowerCase();
                  let targetFile = "tests/test_" + s.storySummary.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).slice(0, 3).join("_") + ".py";
                  if (sl.includes("cart") || sl.includes("add item")) targetFile = "tests/test_cart.py";
                  else if (sl.includes("login") || sl.includes("log in") || sl.includes("logout")) targetFile = "tests/test_login.py";
                  else if (sl.includes("product") || sl.includes("listing")) targetFile = "tests/test_products.py";
                  else if (sl.includes("checkout")) targetFile = "tests/test_checkout.py";
                  return (
                    <div key={s.storyKey} style={{ ...fileOption, borderColor: "#3b82f6", background: "#f0f7ff", marginBottom: "8px" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a" }}>
                          <span style={{ fontFamily: "monospace", background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", marginRight: "8px" }}>{s.storyKey}</span>
                          → <code style={inlineCode}>{targetFile}</code>
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>{s.testCases.length} test case{s.testCases.length !== 1 ? "s" : ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                {/* Single story — Existing matched file */}
                {testFiles.length > 0 && testFiles.map((file) => (
                  <div key={file} style={{ ...fileOption, borderColor: "#3b82f6", background: "#f0f7ff" }}>
                    <div style={{ width: "15px", height: "15px", borderRadius: "50%", background: "#3b82f6", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><polyline points="1,4 3,6 7,2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a" }}>{file}</div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>New test will be merged into this file</div>
                    </div>
                    <span style={{ fontSize: "11px", background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "20px" }}>auto-matched</span>
                  </div>
                ))}

                {/* Create new — only shown when no match found */}
                {testFiles.length === 0 && (
                  <div style={{ ...fileOption, borderColor: "#3b82f6", background: "#f0f7ff" }}>
                    <div style={{ width: "15px", height: "15px", borderRadius: "50%", background: "#3b82f6", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><polyline points="1,4 3,6 7,2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a" }}>Create new file</div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>{suggestedFile}</div>
                    </div>
                    <span style={{ fontSize: "11px", background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: "20px" }}>new</span>
                  </div>
                )}
              </>
            )}
          </div>

          <button
            onClick={handleGenerate}
            disabled={!selectedFile && !createNew}
            style={{ ...solidBtn, opacity: (!selectedFile && !createNew) ? 0.4 : 1 }}
          >
            Generate Playwright code →
          </button>
        </div>
      )}

      {/* Step 3 — Review generated code */}
      {storySelectionDone && step === "generate" && !loading && (
        <div>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <div style={cardTitle}>Review generated code</div>
                <div style={cardSub}>
                  Will be added to: <strong>{selectedFile === "__all__" ? "Multiple files (one per story)" : (createNew ? suggestedFile : selectedFile)}</strong>
                  {" → "} branch: <strong>{selectAll ? testCases.map(s => s.storyKey).join("-") : story.storyKey}</strong>
                </div>
              </div>
              <button onClick={() => copyToClipboard(generatedCode)} style={ghostBtn}>📋 Copy</button>
            </div>
            <pre style={codeBlock}>{generatedCode}</pre>
          </div>

          <div style={{ ...card, marginTop: "12px" }}>
            <div style={cardTitle}>Push to GitHub</div>
            <div style={cardSub}>
              This will push the code to branch <strong>tc-{story.storyKey}</strong> and trigger CI automatically.
            </div>
            <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "12px", margin: "12px 0", fontSize: "12px", color: "#475569" }}>
              <div style={{ marginBottom: "4px" }}>📁 Repo: <strong>{repo}</strong></div>
              <div style={{ marginBottom: "4px" }}>🌿 Branch: <strong>{selectAll ? `tc-${testCases.map(s => s.storyKey).join("-")}` : `tc-${story.storyKey}`}</strong> (new, from main)</div>
              <div>📄 File: <strong>{selectedFile === "__all__" ? "Multiple files (one per story)" : (createNew ? suggestedFile : selectedFile)}</strong></div>
            </div>
            <button onClick={handlePushToGitHub} style={solidBtn}>
              ⚡ Push to GitHub & trigger CI →
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Done */}
      {storySelectionDone && step === "done" && !loading && result && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <polyline points="2,7 5.5,10.5 12,4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "#0f172a" }}>Pushed successfully!</div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                Branch <strong>{result.branch}</strong> created — CI is running
              </div>
            </div>
          </div>

          {/* Files updated */}
          {result.files_updated?.length > 0 && (
            <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "12px", marginBottom: "1rem" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Files updated in branch</div>
              {result.files_updated.map((f) => (
                <div key={f} style={{ fontSize: "12px", color: "#334155", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ color: "#22c55e" }}>✓</span>
                  <code style={inlineCode}>{f}</code>
                </div>
              ))}
              {result.changes_summary && (
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "8px", fontStyle: "italic" }}>{result.changes_summary}</div>
              )}
            </div>
          )}

          {/* Links */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1.5rem" }}>
            <a href={result.branch_url} target="_blank" rel="noreferrer" style={linkCard}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a" }}>🌿 View branch on GitHub</div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>{result.branch_url}</div>
              </div>
              <span style={{ color: "#3b82f6" }}>↗</span>
            </a>
            <a href={result.actions_url} target="_blank" rel="noreferrer" style={linkCard}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#0f172a" }}>⚡ View CI runs on GitHub Actions</div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>{result.actions_url}</div>
              </div>
              <span style={{ color: "#3b82f6" }}>↗</span>
            </a>
          </div>

          {/* Next steps */}
          <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "12px", marginBottom: "1rem" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Next steps</div>
            <div style={{ fontSize: "12px", color: "#334155", lineHeight: "2" }}>
              1. Wait for CI to complete on GitHub Actions<br/>
              2. Pull the branch locally: <code style={inlineCode}>git fetch && git checkout {result.branch}</code><br/>
              3. Run tests: <code style={inlineCode}>pytest tests/</code><br/>
              4. If all good, merge to main: <code style={inlineCode}>git checkout main && git merge {result.branch} && git push</code>
            </div>
          </div>

          <pre style={{ ...codeBlock, maxHeight: "200px" }}>{result.merged_code}</pre>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "1.5rem", marginBottom: "12px" };
const cardTitle = { fontSize: "15px", fontWeight: 600, color: "#0f172a", marginBottom: "4px" };
const cardSub = { fontSize: "13px", color: "#64748b", marginBottom: "0" };
const ghostBtn = { padding: "6px 12px", fontSize: "13px", fontWeight: 500, border: "1px solid #e2e8f0", borderRadius: "7px", background: "transparent", cursor: "pointer", color: "#475569" };
const solidBtn = { padding: "8px 18px", fontSize: "13px", fontWeight: 500, border: "none", borderRadius: "7px", background: "#0f172a", color: "#fff", cursor: "pointer" };
const labelStyle = { display: "block", fontSize: "12px", fontWeight: 500, color: "#475569", marginBottom: "5px" };
const inputStyle = { width: "100%", padding: "8px 12px", fontSize: "13px", border: "1px solid #e2e8f0", borderRadius: "7px", outline: "none", color: "#0f172a" };
const fileOption = { display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", border: "1px solid", borderRadius: "8px", cursor: "pointer" };
const codeBlock = { background: "#0f172a", color: "#e2e8f0", borderRadius: "8px", padding: "1rem", fontSize: "12px", overflowX: "auto", maxHeight: "350px", overflowY: "auto", lineHeight: "1.6", fontFamily: "monospace", whiteSpace: "pre-wrap" };
const linkCard = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", textDecoration: "none" };
const inlineCode = { background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", fontFamily: "monospace", fontSize: "11px" };
