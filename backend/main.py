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
    text_output = []

    def extract(node):
        if isinstance(node, dict):
            if node.get("type") == "text":
                text_output.append(node.get("text", ""))
            for child in node.get("content", []):
                extract(child)
        elif isinstance(node, list):
            for item in node:
                extract(item)

    extract(adf)
    return " ".join(text_output).strip()


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
            "description": extract_text_from_adf(f.get("description")) if f.get("description") else "",
            "status": f.get("status", {}).get("name", ""),
            "priority": f.get("priority", {}).get("name", "") if f.get("priority") else "",
            "assignee": f.get("assignee", {}).get("displayName", "Unassigned") if f.get("assignee") else "Unassigned",
        })

    return {
        "stories": stories,
        "total": len(stories),
        "jql": jql,
    }


# ─────────────────────────────────────────────
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

            # Build steps for GraphQL
            steps_gql = ", ".join([
                f'{{ action: {json.dumps(step.action)}, data: {json.dumps(step.data or "")}, result: {json.dumps(step.result)} }}'
                for step in tc.steps
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
                            project: {{ key: {json.dumps(req.project_key)} }}
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
