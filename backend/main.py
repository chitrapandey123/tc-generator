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
# 2. Generate test cases via Claude
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
            " total results { issueId jira(fields: [\"key\", \"summary\"]) } } }"
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

# ─────────────────────────────────────────────
# 5. Automate TC — Generate Playwright code
# ─────────────────────────────────────────────

class AutomateRequest(BaseModel):
    story_key: str
    story_summary: str
    test_cases: list

class MergeRequest(BaseModel):
    github_token: str
    repo: str
    branch: str
    file_path: str
    generated_code: str
    story_key: str = ""
    all_stories: Optional[list] = None

@app.post("/api/automate/generate")
async def generate_playwright(req: AutomateRequest):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="Anthropic API key not set")

    # Build TC details for Claude
    tc_details = ""
    for tc in req.test_cases:
        tc_details += f"""
Test: {tc.get("title")}
Type: {tc.get("type", "Positive")}
Preconditions: {tc.get("preconditions", "")}
Steps:
"""
        for i, step in enumerate(tc.get("steps", []), 1):
            tc_details += f"  {i}. Action: {step.get('action')} | Data: {step.get('data', '')} | Expected: {step.get('result')}\n"
        tc_details += "\n"

    prompt = f"""You are a Playwright Python pytest automation expert. Generate a complete Python pytest test file for the following test cases from Jira story {req.story_key}: {req.story_summary}

{tc_details}

Use this exact framework structure:

IMPORTS — always use full module path:
- from pages.login_page import LoginPage
- from pages.products_page import ProductsPage
- from pages.cart_page import CartPage
- from pages.checkout_page import CheckoutPage
Only import pages actually needed.

FIXTURES available in conftest.py:
- login_page → LoginPage instance, already on login page (goto() already called)
- products_page → ProductsPage instance
- cart_page → CartPage instance
- checkout_page → CheckoutPage instance
- logged_in → ProductsPage instance, already logged in
- test_data → dict loaded from data/testdata.json

EXACT METHOD NAMES — use ONLY these methods:

LoginPage:
- login_page.login(username, password)
- login_page.login_with_valid_user()
- login_page.assert_login_success()
- login_page.assert_error_message(message)
- login_page.get_error_message()

ProductsPage:
- products_page.goto()
- products_page.add_product_to_cart(product_name)
- products_page.remove_product_from_cart(product_name)
- products_page.go_to_cart()
- products_page.get_cart_count()
- products_page.assert_on_products_page()
- products_page.assert_cart_count(count)
- products_page.get_product_names()
- products_page.logout()

CartPage:
- cart_page.goto()
- cart_page.proceed_to_checkout()
- cart_page.remove_item(product_name)
- cart_page.assert_on_cart_page()
- cart_page.assert_item_in_cart(product_name)
- cart_page.assert_cart_is_empty()
- cart_page.assert_cart_item_count(count)

CheckoutPage:
- checkout_page.fill_shipping_info(first_name, last_name, postal_code)
- checkout_page.continue_to_overview()
- checkout_page.finish_checkout()
- checkout_page.assert_on_checkout_step1()
- checkout_page.assert_on_checkout_step2()
- checkout_page.assert_order_complete()
- checkout_page.assert_error_message(message)

TEST DATA — use these keys:
- test_data["users"]["standard"]["username"] → "standard_user"
- test_data["users"]["standard"]["password"] → "secret_sauce"
- test_data["users"]["locked"]["username"] → "locked_out_user"
- test_data["products"]["backpack"] → "Sauce Labs Backpack"
- test_data["errors"]["locked_user"] → error message
- test_data["errors"]["invalid_credentials"] → error message
- test_data["checkout"]["valid"]["first_name"] → "John"

Rules:
- Return the imports needed AND the test method(s) — NO class declaration
- Include only the imports that are actually used in the test methods
- Use snake_case for all names
- login_page fixture already has goto() called — do NOT call goto() again on login_page
- For tests needing logged in state, use logged_in fixture instead of login_page
- NEVER hardcode usernames, passwords, or product names — always use test_data keys
- NEVER hardcode error messages — always use test_data["errors"] keys  
- NEVER hardcode checkout info — always use test_data["checkout"]["valid"] keys
- test_data["users"]["invalid"]["username"] = "invalid_user", test_data["users"]["invalid"]["password"] = "wrong_password"
- ALWAYS use test_data for ALL data — never invent values or use TODO comments
- Include ALL steps as actions in the test, not just comments
- NEVER hardcode error messages as strings — always use test_data["errors"] keys
- If error message key is unknown, use test_data["errors"].get("key", "TODO: add to testdata.json")
- IMPORTANT: Only import page classes that are listed above in EXACT METHOD NAMES — do not import pages not listed
- If a TC needs a page not in the list, use the closest available page or add a comment
- NEVER add type hints to fixture parameters — write `def test_foo(self, login_page, test_data)` NOT `def test_foo(self, login_page: LoginPage, test_data: dict)`
- Fixtures are injected by pytest by NAME only — no type annotations needed
- ALWAYS wrap each step in `with allure.step("step description"):` for traceability
- Always import allure at the top: `import allure`
- Step descriptions should be human readable e.g. "Enter username: standard_user", "Click Add to Cart", "Verify cart count is 1"
- Follow this pattern:
    with allure.step("Navigate to products page"):
        products_page.goto()
    with allure.step("Add backpack to cart"):
        products_page.add_product_to_cart(test_data["products"]["backpack"])
    with allure.step("Verify cart count is 1"):
        products_page.assert_cart_count(1)

Follow this exact pattern:
```python
# Generated by TC Generator - Review selectors before running
import pytest
from pages.login_page import LoginPage


class TestLogin:
    def test_successful_login_with_valid_credentials(self, login_page, test_data):
        # Precondition: User has a valid account

        # Enter valid credentials and login
        login_page.login(
            test_data["users"]["standard"]["username"],
            test_data["users"]["standard"]["password"]
        )

        # Verify redirected to products page
        login_page.assert_login_success()
```"""

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-opus-4-5",
                "max_tokens": 4000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    code = data["content"][0]["text"].strip()
    # Remove markdown backticks if present
    if code.startswith("```"):
        code = code.split("\n", 1)[1] if "\n" in code else code
        code = code.rsplit("```", 1)[0].strip()

    # Generate filename from story summary
    filename = req.story_summary.lower()
    filename = "".join(c if c.isalnum() or c == " " else "" for c in filename)
    filename = "test_" + "_".join(filename.split()) + ".py"

    return {"code": code, "filename": filename}


def get_page_file(story_summary: str) -> str:
    s = story_summary.lower()
    if "login" in s or "log in" in s or "logout" in s or "log out" in s:
        return "pages/login_page.py"
    elif "cart" in s:
        return "pages/cart_page.py"
    elif "product" in s or "listing" in s:
        return "pages/products_page.py"
    elif "checkout" in s:
        return "pages/checkout_page.py"
    return "pages/base_page.py"


def build_generate_prompt(story_key: str, story_summary: str, test_cases: list) -> str:
    tc_details = ""
    for tc in test_cases:
        tc_details += f"""
Test: {tc.get("title")}
Type: {tc.get("type", "Positive")}
Preconditions: {tc.get("preconditions", "")}
Steps:
"""
        for i, step in enumerate(tc.get("steps", []), 1):
            tc_details += f"  {i}. Action: {step.get('action')} | Data: {step.get('data', '')} | Expected: {step.get('result')}\n"
        tc_details += "\n"
    return f"""You are a Playwright Python pytest automation expert. Generate test methods for Jira story {story_key}: {story_summary}

{tc_details}

Use this exact framework structure:
IMPORTS — always use full module path: from pages.login_page import LoginPage etc.
FIXTURES: login_page, products_page, cart_page, checkout_page, logged_in, test_data
EXACT METHOD NAMES: login_page.login(), login_page.assert_login_success(), products_page.add_product_to_cart(), etc.
TEST DATA: test_data["users"]["standard"]["username"], test_data["errors"]["invalid_credentials"] etc.

Rules:
- Return the imports needed AND the test method(s) — NO class declaration
- Include only imports actually used in the test methods
- NEVER hardcode values — always use test_data keys
- NEVER hardcode error messages — use test_data["errors"] keys
- NEVER add type hints to fixture parameters — write `def test_foo(self, login_page, test_data)` NOT `def test_foo(self, login_page: LoginPage, test_data: dict)`"""


async def run_merge_claude(client, gen_code, file_path, story_key, existing_test, all_pages, existing_testdata, existing_conftest):
    # Strip markdown backticks from gen_code if present
    if gen_code.startswith("```"):
        gen_code = gen_code.split("\n", 1)[1] if "\n" in gen_code else gen_code
        gen_code = gen_code.rsplit("```", 1)[0].strip()
    # Build pages section
    pages_section = ""
    for pf, code in all_pages.items():
        if code:
            pages_section += f"\n--- {pf} ---\n{code}\n"
        else:
            pages_section += f"\n--- {pf} --- (FILE DOES NOT EXIST YET)\n"

    merge_prompt = f"""You are a Playwright Python pytest automation expert. Add new test methods into the existing Python test file.

EXISTING TEST FILE ({file_path}):
{existing_test if existing_test else "File does not exist yet - create from scratch with proper imports and class"}

NEW TEST METHODS TO ADD:
{gen_code}

ALL PAGE OBJECTS IN FRAMEWORK:
{pages_section}

EXISTING TESTDATA (data/testdata.json):
{existing_testdata}

EXISTING CONFTEST (conftest.py):
{existing_conftest}

CRITICAL RULES — MUST FOLLOW:
1. Keep ALL existing code EXACTLY as-is — do NOT modify, fix, or improve any existing code
2. Keep ALL `with allure.step(...)` blocks from the new code EXACTLY as-is — do NOT remove, simplify or rewrite them
3. Keep `import allure` in the imports section
4. Do NOT change any existing test methods even if they look wrong

Merge rules:
- The new code may include imports and test methods
- Merge any new imports at the top (no duplicates)
- Add new methods AFTER last existing test method inside the class
- Add # -- Generated by TC Generator -- comment before new methods
- Do NOT add duplicate imports or methods
- CRITICAL: Before adding any method to a page file, check if a method with SIMILAR functionality already exists — if yes, use the existing method name in the test instead of creating a new one
- For example: if `go_to_cart()` exists, do NOT create `click_cart_icon()` — use `go_to_cart()` instead
- If a page file does not exist yet, create it with the needed class and methods
- In PAGE OBJECT methods (pages/*.py): use wait_for() for waits, NEVER use expect() — expect() is only for tests
- In TEST methods (tests/*.py): use expect() for assertions
- Page object methods should: navigate, fill, click, wait — NOT assert
- NEVER add type hints to fixture parameters in test files
- Add missing testdata keys with "TODO: replace with actual value" placeholder
- Return ONLY valid JSON with this structure:
{{
  "test_file": "complete test file content",
  "page_files": {{"pages/login_page.py": "content or null if unchanged", "pages/products_page.py": "content or null if unchanged", "pages/cart_page.py": "content or null if unchanged", "pages/checkout_page.py": "content or null if unchanged"}},
  "testdata": "complete testdata.json content or null if unchanged",
  "conftest": "complete conftest.py content or null if unchanged",
  "changes_summary": "brief description of all changes made"
}}"""

    resp = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": "claude-opus-4-5", "max_tokens": 8000, "messages": [{"role": "user", "content": merge_prompt}]},
    )
    if not resp.is_success:
        return {}

    raw = resp.json()["content"][0]["text"].strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
        raw = raw.rsplit("```", 1)[0].strip()
    try:
        return json.loads(raw)
    except:
        return {}


async def push_file_fn(client, headers, repo, path, content_str, sha, branch, story_key):
    """Single file push - kept for compatibility but use batch_push_files for multiple files"""
    import base64 as b64
    encoded = b64.b64encode(content_str.encode("utf-8")).decode("utf-8")
    payload = {"message": f"feat: add automated tests for {story_key}", "content": encoded, "branch": branch}
    if sha:
        payload["sha"] = sha
    r = await client.put(f"https://api.github.com/repos/{repo}/contents/{path}", headers=headers, json=payload)
    return r.is_success


async def batch_push_files(client, headers, repo, branch, files_dict, story_key):
    """
    Push multiple files in a single commit using Git Trees API.
    files_dict: {path: content_str}
    Returns list of successfully pushed paths.
    """
    import base64 as b64

    if not files_dict:
        return []

    # Get current branch SHA
    ref_resp = await client.get(
        f"https://api.github.com/repos/{repo}/git/ref/heads/{branch}",
        headers=headers,
    )
    if not ref_resp.is_success:
        return []

    base_sha = ref_resp.json()["object"]["sha"]

    # Get base tree SHA
    commit_resp = await client.get(
        f"https://api.github.com/repos/{repo}/git/commits/{base_sha}",
        headers=headers,
    )
    if not commit_resp.is_success:
        return []

    base_tree_sha = commit_resp.json()["tree"]["sha"]

    # Create tree with all files
    tree_items = []
    for path, content_str in files_dict.items():
        tree_items.append({
            "path": path,
            "mode": "100644",
            "type": "blob",
            "content": content_str,
        })

    tree_resp = await client.post(
        f"https://api.github.com/repos/{repo}/git/trees",
        headers=headers,
        json={"base_tree": base_tree_sha, "tree": tree_items},
    )
    if not tree_resp.is_success:
        return []

    new_tree_sha = tree_resp.json()["sha"]

    # Create commit
    commit_resp = await client.post(
        f"https://api.github.com/repos/{repo}/git/commits",
        headers=headers,
        json={
            "message": f"feat: add automated tests for {story_key}",
            "tree": new_tree_sha,
            "parents": [base_sha],
        },
    )
    if not commit_resp.is_success:
        return []

    new_commit_sha = commit_resp.json()["sha"]

    # Update branch ref
    update_resp = await client.patch(
        f"https://api.github.com/repos/{repo}/git/refs/heads/{branch}",
        headers=headers,
        json={"sha": new_commit_sha},
    )

    if update_resp.is_success:
        return list(files_dict.keys())
    return []



# ─────────────────────────────────────────────
# Decide which test file to use for a story
# ─────────────────────────────────────────────
class FileDecisionRequest(BaseModel):
    github_token: str
    repo: str
    story_key: str
    story_summary: str
    test_cases: list


@app.post("/api/automate/decide-file")
async def decide_test_file(req: FileDecisionRequest):
    import base64 as b64

    async with httpx.AsyncClient(timeout=60) as client:
        headers = {
            "Authorization": f"token {req.github_token}",
            "Accept": "application/vnd.github.v3+json",
        }

        # Fetch all existing test files from repo
        existing_files = {}
        try:
            resp = await client.get(
                f"https://api.github.com/repos/{req.repo}/contents/tests",
                headers=headers,
            )
            if resp.is_success:
                py_files = [f for f in resp.json() if f["name"].endswith(".py") and f["name"].startswith("test_")]
                for f in py_files:
                    file_resp = await client.get(f["url"], headers=headers)
                    if file_resp.is_success:
                        file_content = b64.b64decode(file_resp.json()["content"]).decode("utf-8")
                        existing_files[f["path"]] = file_content[:500]  # first 500 chars to understand the file
        except:
            pass

        # Build TC summary for Claude
        tc_summary = ""
        for tc in req.test_cases:
            tc_summary += f"\nTC: {tc.get('title')}\n"
            tc_summary += f"Preconditions: {tc.get('preconditions', '')}\n"
            tc_summary += "Steps:\n"
            for step in tc.get("steps", []):
                tc_summary += f"  - {step.get('action')} → {step.get('result')}\n"

        # Build existing files summary
        files_summary = ""
        if existing_files:
            for path, content in existing_files.items():
                files_summary += f"\n{path}:\n{content[:200]}...\n"
        else:
            files_summary = "No existing test files found."

        # Ask Claude to decide
        prompt = f"""You are a QA automation expert. Decide which test file the following test cases should be added to.

STORY: {req.story_key} — {req.story_summary}

TEST CASES:
{tc_summary}

EXISTING TEST FILES IN REPO:
{files_summary}

Rules:
- Decide based on the PRIMARY PAGE being tested (login, cart, products, checkout)
- ALWAYS use page-based filenames — NEVER use story title as filename
- Correct examples: test_cart.py, test_login.py, test_products.py, test_checkout.py
- Wrong examples: test_add_item_to_cart.py, test_view_cart_contents.py, test_user_login.py
- If an existing file matches the primary page, use it
- If no existing file matches, create a NEW page-based file (test_cart.py NOT test_add_item_to_cart.py)

Return ONLY a valid JSON object:
{{
  "target_file": "tests/test_cart.py",
  "exists": true,
  "reason": "Brief explanation of why this file was chosen"
}}"""

        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-opus-4-5", "max_tokens": 500, "messages": [{"role": "user", "content": prompt}]},
        )

        if not resp.is_success:
            # Fallback to simple slug
            slug = req.story_summary.lower().replace(" ", "_")[:30]
            return {"target_file": f"tests/test_{slug}.py", "exists": False, "reason": "Fallback"}

        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw
            raw = raw.rsplit("```", 1)[0].strip()

        try:
            decision = json.loads(raw)
            # Verify if file actually exists
            decision["exists"] = decision.get("target_file", "") in existing_files
            return decision
        except:
            slug = req.story_summary.lower().replace(" ", "_")[:30]
            return {"target_file": f"tests/test_{slug}.py", "exists": False, "reason": "Fallback"}

@app.post("/api/automate/merge")
async def merge_playwright(req: MergeRequest):
    import base64 as b64

    async with httpx.AsyncClient(timeout=120) as client:
        headers = {
            "Authorization": f"token {req.github_token}",
            "Accept": "application/vnd.github.v3+json",
        }

        # Step 1: Get default branch SHA
        repo_resp = await client.get(f"https://api.github.com/repos/{req.repo}", headers=headers)
        if not repo_resp.is_success:
            raise HTTPException(status_code=repo_resp.status_code, detail=f"GitHub repo error: {repo_resp.text}")

        default_branch = repo_resp.json().get("default_branch", "main")
        ref_resp = await client.get(f"https://api.github.com/repos/{req.repo}/git/ref/heads/{default_branch}", headers=headers)
        if not ref_resp.is_success:
            raise HTTPException(status_code=ref_resp.status_code, detail=f"GitHub ref error: {ref_resp.text}")

        base_sha = ref_resp.json()["object"]["sha"]

        # Step 2: Create branch tc-{story_key}-{timestamp}
        from datetime import datetime
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M")
        branch_name = f"tc-{req.story_key}-{timestamp}"
        create_branch_resp = await client.post(
            f"https://api.github.com/repos/{req.repo}/git/refs",
            headers=headers,
            json={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
        )
        if not create_branch_resp.is_success and "already exists" not in create_branch_resp.text:
            raise HTTPException(status_code=create_branch_resp.status_code, detail=f"Branch error: {create_branch_resp.text}")

        # Helper to fetch file from branch or default
        async def fetch_file(path):
            for ref in [branch_name, default_branch]:
                r = await client.get(f"https://api.github.com/repos/{req.repo}/contents/{path}?ref={ref}", headers=headers)
                if r.status_code == 200:
                    data = r.json()
                    return b64.b64decode(data["content"]).decode("utf-8"), data.get("sha")
            return "", None

        # Handle all_stories mode — generate and push separate files per story
        if req.all_stories:
            files_updated = []

            # Fetch all existing test files once
            all_existing_files = {}
            try:
                tests_resp = await client.get(
                    f"https://api.github.com/repos/{req.repo}/contents/tests",
                    headers=headers,
                )
                if tests_resp.is_success:
                    for f in tests_resp.json():
                        if f["name"].endswith(".py") and f["name"].startswith("test_"):
                            fr = await client.get(f["url"], headers=headers)
                            if fr.is_success:
                                all_existing_files[f["path"]] = b64.b64decode(fr.json()["content"]).decode("utf-8")[:300]
            except:
                pass

            # Collect ALL files from ALL stories first, then ONE commit
            all_files_to_push = {}

            for story_data in req.all_stories:
                s_key = story_data.get("storyKey", "")
                s_summary = story_data.get("storySummary", "")
                s_tcs = story_data.get("testCases", [])

                # Generate code for this story
                gen_resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": "claude-opus-4-5", "max_tokens": 4000, "messages": [{"role": "user", "content": build_generate_prompt(s_key, s_summary, s_tcs)}]},
                )
                if not gen_resp.is_success:
                    continue

                gen_code = gen_resp.json()["content"][0]["text"].strip()
                if gen_code.startswith("```"):
                    gen_code = gen_code.split("\n", 1)[1] if "\n" in gen_code else gen_code
                    gen_code = gen_code.rsplit("```", 1)[0].strip()

                # Ask Claude which file this story belongs to
                tc_summary = "\n".join([f"- {tc.get('title')}: " + " -> ".join([s.get('action','') for s in tc.get('steps',[])[:2]]) for tc in s_tcs])
                files_context = "\n".join([f"{p}: {c[:150]}" for p, c in all_existing_files.items()])

                decide_prompt = f"""Which test file should these test cases go into?

STORY: {s_key} - {s_summary}
TEST CASES:
{tc_summary}

EXISTING FILES:
{files_context if files_context else "No existing test files"}

Return ONLY valid JSON: {{"target_file": "tests/test_cart.py", "exists": true}}
Rules:
- Base decision on PRIMARY PAGE being tested (login, cart, products, checkout)
- ALWAYS use page-based filenames — NEVER use story title as filename
- Correct: test_cart.py, test_login.py, test_products.py, test_checkout.py
- Wrong: test_add_item_to_cart.py, test_view_cart_contents.py, test_user_login.py
- If existing file matches the primary page, use it
- If no match, create page-based file (test_cart.py NOT test_add_item_to_cart.py)"""

                decide_resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": "claude-opus-4-5", "max_tokens": 100, "messages": [{"role": "user", "content": decide_prompt}]},
                )

                if decide_resp.is_success:
                    raw = decide_resp.json()["content"][0]["text"].strip()
                    if raw.startswith("```"):
                        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
                        raw = raw.rsplit("```", 1)[0].strip()
                    try:
                        decision = json.loads(raw)
                        s_file = decision.get("target_file", f"tests/test_{s_key.lower()}.py")
                    except:
                        s_file = f"tests/test_{s_key.lower()}.py"
                else:
                    s_file = f"tests/test_{s_key.lower()}.py"

                existing, _ = await fetch_file(s_file)
                s_all_pages = {}
                for pf in ["pages/login_page.py", "pages/products_page.py", "pages/cart_page.py", "pages/checkout_page.py", "pages/base_page.py"]:
                    code, _ = await fetch_file(pf)
                    s_all_pages[pf] = code
                existing_testdata, _ = await fetch_file("data/testdata.json")
                existing_conftest, _ = await fetch_file("conftest.py")

                updates = await run_merge_claude(client, gen_code, s_file, s_key, existing, s_all_pages, existing_testdata, existing_conftest)

                # Collect files — later pushed in ONE commit
                if updates.get("test_file"):
                    all_files_to_push[s_file] = updates["test_file"]
                for pf, pf_content in (updates.get("page_files") or {}).items():
                    if pf_content:
                        all_files_to_push[pf] = pf_content
                if updates.get("testdata"):
                    all_files_to_push["data/testdata.json"] = updates["testdata"]
                if updates.get("conftest"):
                    all_files_to_push["conftest.py"] = updates["conftest"]

            # ONE commit for ALL stories
            files_updated = await batch_push_files(
                client, headers, req.repo, branch_name, all_files_to_push, req.story_key
            )

            return {
                "status": "merged",
                "branch": branch_name,
                "branch_url": f"https://github.com/{req.repo}/tree/{branch_name}",
                "actions_url": f"https://github.com/{req.repo}/actions",
                "file_path": ", ".join(files_updated),
                "files_updated": files_updated,
                "changes_summary": f"Added tests for {len(req.all_stories)} stories across {len(set(files_updated))} files",
                "merged_code": f"Generated {len(files_updated)} test files",
            }

        # Step 3: Fetch all relevant files
        existing_test, test_sha = await fetch_file(req.file_path)

        # Fetch ALL page files
        page_files_list = [
            "pages/login_page.py",
            "pages/products_page.py",
            "pages/cart_page.py",
            "pages/checkout_page.py",
            "pages/base_page.py",
        ]
        all_pages = {}
        page_shas = {}
        for pf in page_files_list:
            code, sha = await fetch_file(pf)
            all_pages[pf] = code
            page_shas[pf] = sha

        existing_testdata, testdata_sha = await fetch_file("data/testdata.json")
        existing_conftest, conftest_sha = await fetch_file("conftest.py")

        # Step 4: Claude analyzes ALL files
        updates = await run_merge_claude(
            client, req.generated_code, req.file_path, req.story_key,
            existing_test, all_pages, existing_testdata, existing_conftest
        )

        if not updates:
            raise HTTPException(status_code=500, detail="Failed to generate updates")

        # Step 5: Batch push ALL changed files in ONE commit
        files_to_push = {}

        if updates.get("test_file"):
            files_to_push[req.file_path] = updates["test_file"]

        for pf, pf_content in (updates.get("page_files") or {}).items():
            if pf_content:
                files_to_push[pf] = pf_content

        if updates.get("testdata"):
            files_to_push["data/testdata.json"] = updates["testdata"]

        if updates.get("conftest"):
            files_to_push["conftest.py"] = updates["conftest"]

        files_updated = await batch_push_files(
            client, headers, req.repo, branch_name, files_to_push, req.story_key
        )

        return {
            "status": "merged" if existing_test else "new_file",
            "branch": branch_name,
            "branch_url": f"https://github.com/{req.repo}/tree/{branch_name}",
            "actions_url": f"https://github.com/{req.repo}/actions",
            "file_path": req.file_path,
            "files_updated": files_updated,
            "changes_summary": updates.get("changes_summary", ""),
            "merged_code": updates.get("test_file", req.generated_code),
        }