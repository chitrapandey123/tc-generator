# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

TC Generator automates the QA workflow: Jira story → AI-generated test cases → Xray push → Playwright Python automation code pushed to GitHub. It is a 5-step React wizard backed by a single FastAPI file.

## Running locally

**Backend** (port 8000):
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

**Frontend** (port 5173):
```bash
cd frontend
npm install   # first time only
npm run dev
```

**Install backend deps** (after adding to requirements.txt):
```bash
cd backend && source venv/bin/activate && pip install -r requirements.txt
```

No test suite exists in this repo.

## Architecture

The entire backend is a single file: `backend/main.py`. All API endpoints, request models, helper functions, and Claude prompt logic live there. There is no database — all state is in the React frontend between wizard steps.

The frontend is a single-page React app (`frontend/src/App.jsx`) that owns the 5-step flow state and passes data down to step components. All API calls are centralised in `frontend/src/api.js`.

### 5-step flow (state in `App.jsx`)
| Step | Component | What happens |
|------|-----------|--------------|
| 0 Connect | inline in App.jsx | User enters Jira project key |
| 1 Stories | `StoriesList.jsx` | Fetch stories via JQL; shows existing Xray TC count per story |
| 2 Review | `ReviewTC.jsx` | Claude generates TCs; user edits title/steps/preconditions |
| 3 Push | `PushResults.jsx` | TCs pushed to Xray GraphQL; linked to story via Jira issue link |
| 4 Automate | `AutomateTC.jsx` | Claude generates Playwright Python; merged into GitHub repo via Git Trees API |

### External APIs used
- **Jira REST API v3** — story fetch (JQL POST), issue lookup, issue linking, description update
- **Xray Cloud GraphQL** — `createTest` mutation, `getTests` query
- **Anthropic API** — called directly with `httpx`, not the Anthropic SDK
- **GitHub REST API** — read repo files, create branch, batch commit via Git Trees API

### Claude models
- `claude-sonnet-4-20250514` — TC generation from Jira stories
- `claude-opus-4-5` — Playwright code generation, merge-into-existing-file, file decision, all-stories batch mode

## Key technical decisions

- **Xray `createTest` mutation**: uses `project: { key: QA }` (unquoted project name field, not a string)
- **Preconditions in Xray**: inserted as Step 1 with `action: "Precondition"`, not as a separate Xray precondition entity
- **ADF parsing**: custom recursive `extract_text_from_adf()` in `main.py` handles Atlassian Document Format
- **Batch GitHub push**: all changed files (test file + page objects + testdata.json + conftest.py) are committed in ONE Git tree commit so only one CI run is triggered. Branch name pattern: `tc-{story-keys}-{timestamp}`
- **Page-based test filenames**: Claude is instructed to always use `test_cart.py` not `test_add_item_to_cart.py` — filename reflects the primary page under test
- **All-stories mode**: the merge endpoint accepts `all_stories` payload; it generates code per story, collects all files, then does a single `batch_push_files` call

## Environment variables

Copy `backend/.env.example` to `backend/.env`:

```
JIRA_EMAIL=
JIRA_API_TOKEN=
JIRA_DOMAIN=yourcompany.atlassian.net
ANTHROPIC_API_KEY=
XRAY_CLIENT_ID=
XRAY_CLIENT_SECRET=
```

The GitHub token is entered by the user in the UI (Step 4) and is never stored server-side.

## Automation target framework

Generated Playwright code targets the separate repo `chitrapandey123/playwright-python`. That framework uses:
- Page Object Model under `pages/` (login_page, products_page, cart_page, checkout_page, base_page)
- pytest fixtures in `conftest.py` (login_page, products_page, cart_page, checkout_page, logged_in, test_data)
- Test data from `data/testdata.json`
- `allure.step()` wrappers on every step for traceability

When modifying Claude prompts in the merge or generate endpoints, ensure the page method names, fixture names, and testdata key paths stay consistent with what the `build_generate_prompt` and `run_merge_claude` functions specify.
