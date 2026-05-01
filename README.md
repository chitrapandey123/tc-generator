# TC Generator — AI-Powered QA Automation Tool

> Automates the full QA workflow: Jira story → Xray test case → Playwright automation code

[![GitHub](https://img.shields.io/badge/GitHub-tc--generator-black)](https://github.com/chitrapandey123/tc-generator)
![Status](https://img.shields.io/badge/status-in%20progress-yellow)

---

## What it does

TC Generator is a full-stack tool that takes a Jira user story and automates the entire QA workflow in 5 steps:

1. **Connect** — Enter your Jira project key
2. **Stories** — Browse stories with descriptions, acceptance criteria, and existing TC counts
3. **Review** — Claude AI generates structured test cases; edit title, steps, preconditions
4. **Push** — Send test cases to Xray with steps, preconditions, and requirement linking
5. **Automate** — Generate Playwright Python automation code and push to GitHub with CI/CD

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python FastAPI |
| Frontend | React 18 + Vite |
| AI | Anthropic Claude API (claude-opus-4-5, claude-sonnet-4) |
| Test Management | Xray Cloud GraphQL API |
| Project Management | Jira REST API v3 |
| Automation | Playwright Python + pytest + Page Object Model |
| Version Control | GitHub REST API + GitHub Actions |
| Reporting | Allure Report → GitHub Pages |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    TC Generator UI                   │
│         React frontend (port 5173)                   │
└────────────────────┬────────────────────────────────┘
                     │ HTTP
┌────────────────────▼────────────────────────────────┐
│                FastAPI Backend                       │
│                  (port 8000)                         │
├──────────┬──────────┬──────────┬────────────────────┤
│  Jira    │  Claude  │  Xray    │  GitHub API        │
│  REST    │  API     │  GraphQL │                    │
│  API     │          │  API     │                    │
└──────────┴──────────┴──────────┴────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│         playwright-python (separate repo)            │
│    tests/ | pages/ | conftest.py | data/            │
│              GitHub Actions CI/CD                    │
│         Allure Report → GitHub Pages                 │
└─────────────────────────────────────────────────────┘
```

---

## Project Structure

```
tc-generator/
├── backend/
│   ├── main.py              # FastAPI app with all endpoints
│   └── .env                 # Environment variables
├── frontend/
│   └── src/
│       ├── App.jsx           # Main app with 5-step flow
│       ├── api.js            # API calls
│       └── components/
│           ├── StoriesList.jsx    # Stories with TC counts
│           ├── ReviewTC.jsx       # Edit generated TCs
│           ├── PushResults.jsx    # Xray push results
│           └── AutomateTC.jsx     # Playwright code generation
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stories` | Fetch Jira stories via JQL |
| POST | `/api/generate-tc` | Generate test cases using Claude |
| POST | `/api/xray/token` | Authenticate with Xray Cloud |
| POST | `/api/xray/push` | Create tests in Xray with steps |
| GET | `/api/xray/tests/{story_key}` | Fetch existing tests for a story |
| POST | `/api/automate/generate` | Generate Playwright Python code |
| POST | `/api/automate/decide-file` | Claude decides which test file to use |
| POST | `/api/automate/merge` | Merge code into GitHub framework |

---

## Claude AI Prompts

The tool uses 5 carefully engineered prompts. See `TC_Generator_Prompts.docx` for full details.

| Prompt | Purpose | Model |
|--------|---------|-------|
| TC Generation | Generate structured test cases from Jira stories | claude-sonnet-4 |
| Generate Code | Generate Playwright Python test methods with allure.step() | claude-opus-4-5 |
| Merge Code | Merge new tests into existing framework without modifying existing code | claude-opus-4-5 |
| Decide File | Decide which page-based test file a story belongs to | claude-opus-4-5 |
| Decide File (All Stories) | File decision per story in All Stories mode | claude-opus-4-5 |

---

## Automation Framework

Generated code targets [playwright-python](https://github.com/chitrapandey123/playwright-python):

### What TC Generator does automatically

1. Reads ALL existing files from GitHub (test files, page objects, testdata.json, conftest.py)
2. Claude generates new test methods with `with allure.step()` blocks
3. Claude decides correct page-based test file (`test_cart.py` not `test_add_item_to_cart.py`)
4. Creates missing page objects if needed
5. Updates `testdata.json` with missing keys (TODO placeholders)
6. Pushes ALL changes in ONE Git tree commit → ONE CI run
7. Branch: `tc-QA-3-QA-4-20250419-1045` (story keys + timestamp — no conflicts)

---

## Running Locally

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
# http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

### Environment Variables (backend/.env)

```
JIRA_EMAIL=your@email.com
JIRA_API_TOKEN=your_jira_token
JIRA_DOMAIN=yourcompany.atlassian.net
ANTHROPIC_API_KEY=sk-ant-...
XRAY_CLIENT_ID=your_xray_client_id
XRAY_CLIENT_SECRET=your_xray_client_secret
```

---

## Key Technical Decisions

- **Xray GraphQL** — `createTest` mutation uses `project: { key: QA }` (unquoted name)
- **Preconditions** — Added as Step 1 in Xray (Action: "Precondition", Result: precondition text)
- **ADF Parsing** — Custom recursive parser for Atlassian Document Format
- **Batch GitHub Push** — All framework files in ONE Git tree commit (no multiple CI runs)
- **Branch naming** — `tc-{story-keys}-{timestamp}` to avoid team conflicts
- **Page-based filenames** — `test_cart.py` not `test_add_item_to_cart.py`

---

## Allure Reporting

```
https://chitrapandey123.github.io/playwright-python/allure-history/
```

Each test shows step-by-step trace, screenshot on failure, URL on failure, and page HTML.

---

## Author

Chitra Pandey — QA Engineer | [github.com/chitrapandey123](https://github.com/chitrapandey123)
