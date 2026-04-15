from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os
import httpx
import json
import base64
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# Environment variables
# ─────────────────────────────────────────────
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN")
JIRA_DOMAIN = os.getenv("JIRA_DOMAIN")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

print("JIRA_DOMAIN:", JIRA_DOMAIN)
print("ANTHROPIC_API_KEY set:", bool(ANTHROPIC_API_KEY))


# ─────────────────────────────────────────────
# Request model for Claude
# ─────────────────────────────────────────────
class GenerateTCRequest(BaseModel):
    stories: list  # list of { key, summary, description }


# ─────────────────────────────────────────────
# Debug: get all issue link types from Jira
# ─────────────────────────────────────────────
@app.get("/api/link-types")
async def get_link_types():
    encoded = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_API_TOKEN}".encode()).decode()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"https://{JIRA_DOMAIN}/rest/api/3/issueLinkType",
            headers={
                "Authorization": f"Basic {encoded}",
                "Accept": "application/json",
            },
        )
    return resp.json()


# ─────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────
@app.get("/")
def read_root():
    return {
        "message": "Backend is running",
        "jira_domain": JIRA_DOMAIN,
        "anthropic_key_set": bool(ANTHROPIC_API_KEY),
    }


# ─────────────────────────────────────────────
# Helper: extract plain text from Jira ADF
# ─────────────────────────────────────────────
def extract_text_from_adf(adf):
    lines = []

    def extract(node, depth=0):
        if not node:
            return
        node_type = node.get("type", "") if isinstance(node, dict) else ""

        if node_type == "text":
            lines.append(node.get("text", ""))

        elif node_type == "hardBreak":
            lines.append("\n")

        elif node_type == "paragraph":
            for child in node.get("content", []):
                extract(child, depth)
            lines.append("\n")

        elif node_type in ("bulletList", "orderedList"):
            lines.append("\n")
            for i, child in enumerate(node.get("content", [])):
                prefix = f"{i+1}. " if node_type == "orderedList" else "• "
                lines.append(prefix)
                extract(child, depth + 1)

        elif node_type == "listItem":
            for child in node.get("content", []):
                extract(child, depth)
            lines.append("\n")

        elif node_type == "heading":
            for child in node.get("content", []):
                extract(child, depth)
            lines.append("\n")

        elif node_type == "blockquote":
            for child in node.get("content", []):
                extract(child, depth)
            lines.append("\n")

        else:
            for child in node.get("content", []):
                extract(child, depth)

    if isinstance(adf, str):
        return adf
    extract(adf)
    # Clean up excessive newlines
    result = "".join(lines).strip()
    import re
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result


# ─────────────────────────────────────────────
# 1. Fetch stories from Jira
# ─────────────────────────────────────────────
@app.get("/api/stories")
async def get_stories(
    project: str = "QA",
    issue_type: str = "Story",
    status: str = "",
    sprint: str = "",
    max_results: int = 25,
):
    if not JIRA_EMAIL or not JIRA_API_TOKEN or not JIRA_DOMAIN:
        raise HTTPException(
            status_code=500,
            detail="Missing JIRA_EMAIL, JIRA_API_TOKEN, or JIRA_DOMAIN in .env"
        )

    # Build JQL
    jql_parts = [
        f'project = "{project}"',
        f'issuetype = "{issue_type}"',
    ]
    if status:
        jql_parts.append(f'status = "{status}"')
    if sprint == "active":
        jql_parts.append("sprint in openSprints()")
    elif sprint == "backlog":
        jql_parts.append("sprint is EMPTY")

    jql = " AND ".join(jql_parts) + " ORDER BY created DESC"
    url = f"https://{JIRA_DOMAIN}/rest/api/3/search/jql"

    payload = {
        "jql": jql,
        "maxResults": max_results,
        "fields": ["key", "summary", "description", "status", "priority", "assignee"],
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url,
            json=payload,
            auth=(JIRA_EMAIL, JIRA_API_TOKEN),
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )

    if not resp.is_success:
        try:
            error_msg = resp.json().get("errorMessages", [resp.text])[0]
        except Exception:
            error_msg = resp.text
        raise HTTPException(status_code=resp.status_code, detail=error_msg)

    data = resp.json()

    stories = []
    for issue in data.get("issues", []):
        f = issue.get("fields", {})
        stories.append({
            "key": issue.get("key"),
            "summary": f.get("summary", ""),
            "description": format_description(extract_text_from_adf(f.get("description"))) if f.get("description") else "",
            "status": f.get("status", {}).get("name", ""),
            "priority": f.get("priority", {}).get("name", "") if f.get("priority") else "",
            "assignee": f.get("assignee", {}).get("displayName", "Unassigned") if f.get("assignee") else "Unassigned",
        })

    return {
        "stories": stories,
        "total": len(stories),
        "jql": jql,
        "jira_domain": JIRA_DOMAIN,
    }




def format_description(text):
    if not text:
        return ""
    import re
    text = re.sub(r"\s*Acceptance Criteria:?\s*", "\n\nAcceptance Criteria\n", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+So that\s+", "\nSo that ", text, flags=re.IGNORECASE)
    text = re.sub(r"\.\s+([A-Z])", ".\n\u2022 \\1", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


# ─────────────────────────────────────────────
# Fetch existing TCs for a story from Xray

# ─────────────────────────────────────────────
# Fetch existing TCs for a story from Xray
# ─────────────────────────────────────────────
@app.get("/api/xray/tests/{story_key}")
async def get_existing_tests(story_key: str):
    client_id = os.getenv("XRAY_CLIENT_ID")
    client_secret = os.getenv("XRAY_CLIENT_SECRET")
    if not client_id or not client_secret:
        return {"tests": [], "total": 0}

    async with httpx.AsyncClient(timeout=30) as client:
        auth_resp = await client.post(
            "https://xray.cloud.getxray.app/api/v2/authenticate",
            json={"client_id": client_id, "client_secret": client_secret},
            headers={"Content-Type": "application/json"},
        )
        if not auth_resp.is_success:
            return {"tests": [], "total": 0}

        token = auth_resp.text.strip().strip('"')

        encoded = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_API_TOKEN}".encode()).decode()
        issue_resp = await client.get(
            f"https://{JIRA_DOMAIN}/rest/api/3/issue/{story_key}",
            headers={"Authorization": f"Basic {encoded}", "Accept": "application/json"},
        )
        if not issue_resp.is_success:
            return {"tests": [], "total": 0}

        issue_id = issue_resp.json().get("id")

        query = (
            "{ getTests(jql: \"issue in linkedIssues(" + issue_id + ")\"  , limit: 100) {"
            " total results {"
            " issueId jira(fields: [\"key\", \"summary\"]) } } }"
        )

        xray_resp = await client.post(
            "https://xray.cloud.getxray.app/api/v2/graphql",
            json={"query": query},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        if not xray_resp.is_success:
            return {"tests": [], "total": 0}

        data = xray_resp.json()
        tests_data = data.get("data", {}).get("getTests", {})
        if not tests_data:
            return {"tests": [], "total": 0}
        tests = []
        for t in (tests_data.get("results") or []):
            jira_fields = t.get("jira") or {}
            key = jira_fields.get("key", "")
            summary = jira_fields.get("summary", "")
            if key:
                tests.append({"key": key, "summary": summary})
        return {"tests": tests, "total": tests_data.get("total", 0)}

# 2. Generate test cases via Claude
# ─────────────────────────────────────────────
@app.post("/api/generate-tc")
async def generate_tc(req: GenerateTCRequest):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY not set in .env"
        )

    if not req.stories:
        raise HTTPException(
            status_code=400,
            detail="No stories provided. Pass at least one story."
        )

    # Build prompt
    stories_text = "\n\n---\n\n".join([
        f"Key: {s.get('key')}\nSummary: {s.get('summary')}\nDescription: {s.get('description') or 'No description provided.'}"
        for s in req.stories
    ])

    prompt = f"""You are a senior QA engineer. For each Jira story below, generate comprehensive test cases.

Return ONLY a valid JSON array. No markdown, no backticks, no explanation — just pure JSON.

Each element must follow this exact shape:
{{
  "storyKey": "QA-1",
  "storySummary": "story title here",
  "testCases": [
    {{
      "id": "TC-01",
      "title": "Test case title",
      "type": "Positive",
      "priority": "High",
      "preconditions": "What needs to be set up before the test",
      "description": "Brief 1-2 sentence summary of what this test case verifies and why it is important",
      "steps": [
        {{
          "action": "What the tester does",
          "data": "Test data used (empty string if none)",
          "result": "What should happen"
        }}
      ]
    }}
  ]
}}

Rules:
- type must be one of: Positive, Negative, Edge Case, Performance, Security
- priority must be one of: High, Medium, Low
- Generate 3-5 test cases per story
- Cover happy path, negative cases, and edge cases
- Return pure JSON array only
- Preconditions should only contain the MINIMUM system state required before testing begins (e.g. "User is logged in", "App is open"). Do NOT include test actions in preconditions
- All meaningful test actions (e.g. adding a product to cart, filling a form, clicking a button) must be written as steps, not preconditions
- Steps describe every action the tester takes during the test from start to finish

Stories:
{stories_text}"""

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 8000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Claude API error: {resp.text}"
        )

    data = resp.json()

    # Check if response was truncated
    stop_reason = data.get("stop_reason", "")
    if stop_reason == "max_tokens":
        raise HTTPException(
            status_code=500,
            detail="Claude response was truncated. Try passing fewer stories at once (max 3 recommended)."
        )

    # Extract text from Claude response
    raw = "".join(c.get("text", "") for c in data.get("content", []))

    # Strip markdown fences if Claude added them
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("```")[1]
        if clean.startswith("json"):
            clean = clean[4:]
    clean = clean.strip()

    # Parse JSON
    try:
        result = json.loads(clean)
    except Exception:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse Claude response. Raw: {raw[:300]}"
        )

    return {"test_cases": result}


# ─────────────────────────────────────────────
# Xray Request Models
# ─────────────────────────────────────────────
class XrayTokenRequest(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None

class XrayStep(BaseModel):
    action: str
    data: str = ""
    result: str

class XrayTestCase(BaseModel):
    title: str
    preconditions: str = ""
    description: Optional[str] = ""
    steps: List[XrayStep]

class XrayPushRequest(BaseModel):
    project_key: str
    story_key: str
    test_cases: List[XrayTestCase]
    xray_token: str


# ─────────────────────────────────────────────
# 3. Get Xray Auth Token
# ─────────────────────────────────────────────
@app.post("/api/xray/token")
async def get_xray_token(req: XrayTokenRequest):
    client_id = req.client_id or os.getenv("XRAY_CLIENT_ID")
    client_secret = req.client_secret or os.getenv("XRAY_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=400,
            detail="Xray Client ID and Secret required. Set XRAY_CLIENT_ID and XRAY_CLIENT_SECRET in .env"
        )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://xray.cloud.getxray.app/api/v2/authenticate",
            json={"client_id": client_id, "client_secret": client_secret},
            headers={"Content-Type": "application/json"},
        )

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Xray authentication failed: {resp.text}"
        )

    # Xray returns token as a plain quoted string e.g. "eyJhbG..."
    token = resp.text.strip().strip('"')
    return {"token": token}


# ─────────────────────────────────────────────
# 4. Push Test Cases to Xray
# ─────────────────────────────────────────────
@app.post("/api/xray/push")
async def push_to_xray(req: XrayPushRequest):
    xray_token = req.xray_token
    if not xray_token:
        raise HTTPException(
            status_code=400,
            detail="xray_token is required. Call /api/xray/token first."
        )

    results = []

    async with httpx.AsyncClient(timeout=30) as client:

        # Look up internal Jira issue ID for the story key
        story_issue_id = None
        if req.story_key:
            jira_url = f"https://{os.getenv('JIRA_DOMAIN')}/rest/api/3/issue/{req.story_key}"
            encoded = base64.b64encode(f"{os.getenv('JIRA_EMAIL')}:{os.getenv('JIRA_API_TOKEN')}".encode()).decode()
            issue_resp = await client.get(
                jira_url,
                headers={
                    "Authorization": f"Basic {encoded}",
                    "Accept": "application/json",
                },
            )
            if issue_resp.is_success:
                story_issue_id = issue_resp.json().get("id")

        for tc in req.test_cases:

            # Add precondition as first step if exists
            all_steps = []
            if tc.preconditions:
                all_steps.append({"action": "Precondition", "data": "", "result": tc.preconditions})
            for step in tc.steps:
                all_steps.append({"action": step.action, "data": step.data or "", "result": step.result})

            # Build steps for GraphQL
            steps_gql = ", ".join([
                f'{{ action: {json.dumps(s["action"])}, data: {json.dumps(s["data"])}, result: {json.dumps(s["result"])} }}'
                for s in all_steps
            ])

            # Step 1: Create Test via Xray GraphQL createTest mutation
            mutation = f"""
            mutation {{
                createTest(
                    testType: {{ name: "Manual" }},
                    steps: [{steps_gql}],
                    jira: {{
                        fields: {{
                            summary: {json.dumps(tc.title)},
                            project: {{ key: "{req.project_key}" }}
                        }}
                    }}
                ) {{
                    test {{
                        issueId
                        jira(fields: ["key"])
                    }}
                    warnings
                }}
            }}
            """

            resp = await client.post(
                "https://xray.cloud.getxray.app/api/v2/graphql",
                json={"query": mutation},
                headers={
                    "Authorization": f"Bearer {xray_token}",
                    "Content-Type": "application/json",
                },
            )

            if not resp.is_success:
                results.append({
                    "title": tc.title,
                    "status": "failed",
                    "error": resp.text,
                })
                continue

            resp_data = resp.json()

            # Check for GraphQL errors
            if "errors" in resp_data:
                results.append({
                    "title": tc.title,
                    "status": "failed",
                    "error": str(resp_data["errors"]),
                })
                continue

            test_issue = resp_data.get("data", {}).get("createTest", {}).get("test", {})
            test_key = ""
            if test_issue and test_issue.get("jira"):
                test_key = test_issue["jira"].get("key", "")

            # Update Jira description with TC description
            tc_description = getattr(tc, "description", "") or ""
            if test_key and tc_description:
                desc_payload = {
                    "fields": {
                        "description": {
                            "type": "doc",
                            "version": 1,
                            "content": [{
                                "type": "paragraph",
                                "content": [{"type": "text", "text": tc_description}]
                            }]
                        }
                    }
                }
                await client.put(
                    f"https://{os.getenv('JIRA_DOMAIN')}/rest/api/3/issue/{test_key}",
                    json=desc_payload,
                    auth=(os.getenv("JIRA_EMAIL"), os.getenv("JIRA_API_TOKEN")),
                    headers={"Accept": "application/json", "Content-Type": "application/json"},
                )

            # Step 2: Link Test to Story using Jira issue link API
            # Link type "Test": inward = "is tested by", outward = "tests"
            # Story "is tested by" Test → inwardIssue = story, outwardIssue = test
            link_errors = None
            link_result = {}
            if req.story_key and test_key:
                link_payload = {
                    "type": {"name": "Test"},
                    "inwardIssue": {"key": req.story_key},
                    "outwardIssue": {"key": test_key},
                }
                link_resp = await client.post(
                    f"https://{os.getenv('JIRA_DOMAIN')}/rest/api/3/issueLink",
                    json=link_payload,
                    auth=(os.getenv("JIRA_EMAIL"), os.getenv("JIRA_API_TOKEN")),
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                )
                if link_resp.status_code == 201:
                    link_result = {"linked": True}
                else:
                    link_errors = link_resp.text

            results.append({
                "title": tc.title,
                "status": "success",
                "key": test_key,
                "url": f"https://{os.getenv('JIRA_DOMAIN')}/browse/{test_key}",
                "linked": bool(link_result.get("linked")),
                "link_errors": link_errors,
            })

    success = sum(1 for r in results if r["status"] == "success")
    failed = sum(1 for r in results if r["status"] == "failed")

    return {
        "results": results,
        "summary": {
            "total": len(results),
            "success": success,
            "failed": failed,
        }
    }