# TC Generator — Backend (FastAPI)

Python FastAPI backend that connects Jira, Claude AI, and Xray APIs.

---

## Tech Stack
- Python 3.9+
- FastAPI — web framework
- httpx — async HTTP client
- python-dotenv — environment management
- Pydantic — request/response validation

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check — confirms all keys are set |
| GET | `/api/stories` | Fetch stories from Jira via JQL |
| POST | `/api/generate-tc` | Generate test cases using Claude AI |
| POST | `/api/xray/token` | Authenticate with Xray Cloud |
| POST | `/api/xray/push` | Push test cases to Xray + link to story |
| GET | `/api/link-types` | List all Jira issue link types |

---

## Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Mac/Linux
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run server
uvicorn main:app --reload
```

Server runs at `http://localhost:8000`
Interactive API docs at `http://localhost:8000/docs`

---

## Environment Variables

```
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_DOMAIN=yourcompany.atlassian.net
ANTHROPIC_API_KEY=sk-ant-your-key-here
XRAY_CLIENT_ID=your-xray-client-id
XRAY_CLIENT_SECRET=your-xray-client-secret
```

**How to get credentials:**
- Jira API token: [id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- Anthropic API key: [console.anthropic.com](https://console.anthropic.com)
- Xray API keys: Jira Settings → Apps → Marketplace apps → Xray → API Keys

---

## Endpoint Details

### GET `/api/stories`
Fetches stories from Jira using JQL.

**Query params:**
```
project     string   Project key (default: "QA")
issue_type  string   Issue type (default: "Story")
status      string   Filter by status (optional)
sprint      string   "active", "backlog", or "" for all
max_results int      Max stories to return (default: 25)
```

**Response:**
```json
{
  "stories": [
    {
      "key": "QA-1",
      "summary": "User should be able to log in",
      "description": "As a user...",
      "status": "To Do",
      "priority": "Medium",
      "assignee": "chitra pandey"
    }
  ],
  "total": 3,
  "jql": "project = \"QA\" AND issuetype = \"Story\" ORDER BY created DESC"
}
```

---

### POST `/api/generate-tc`
Generates test cases using Claude AI.

**Request body:**
```json
{
  "stories": [
    {
      "key": "QA-1",
      "summary": "User should be able to log in",
      "description": "As a user I want to log in..."
    }
  ]
}
```

**Response:**
```json
{
  "test_cases": [
    {
      "storyKey": "QA-1",
      "storySummary": "User should be able to log in",
      "testCases": [
        {
          "id": "TC-01",
          "title": "Successful login with valid credentials",
          "type": "Positive",
          "priority": "High",
          "preconditions": "User has a valid account",
          "steps": [
            {
              "action": "Navigate to login page",
              "data": "",
              "result": "Login page is displayed"
            }
          ]
        }
      ]
    }
  ]
}
```

---

### POST `/api/xray/token`
Exchanges Xray Client ID + Secret for a Bearer token.

**Request body:** `{}` (reads from .env)

**Response:**
```json
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

---

### POST `/api/xray/push`
Creates test issues in Xray and links them to the parent story.

**Request body:**
```json
{
  "project_key": "QA",
  "story_key": "QA-1",
  "xray_token": "eyJhbGciOiJIUzI1NiIs...",
  "test_cases": [
    {
      "title": "Successful login with valid credentials",
      "preconditions": "User has a valid account",
      "steps": [
        {
          "action": "Navigate to login page",
          "data": "",
          "result": "Login page is displayed"
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "title": "Successful login with valid credentials",
      "status": "success",
      "key": "QA-11",
      "url": "https://yourcompany.atlassian.net/browse/QA-11",
      "linked": true,
      "link_errors": null
    }
  ],
  "summary": { "total": 1, "success": 1, "failed": 0 }
}
```

---

## How Xray Integration Works

```
1. Authenticate with Xray Cloud
   POST https://xray.cloud.getxray.app/api/v2/authenticate
   → returns Bearer token

2. Create Test issue with steps
   POST https://xray.cloud.getxray.app/api/v2/graphql
   → GraphQL createTest mutation
   → returns new issue key (e.g. QA-11)

3. Link Test to Story
   POST https://yourcompany.atlassian.net/rest/api/3/issueLink
   → Jira "Test" link type (installed by Xray)
   → Story "is tested by" Test
```

---

## Project Structure

```
jira-claude-backend/
├── main.py           # All endpoints and business logic
├── requirements.txt  # Python dependencies
├── .env.example      # Environment variables template
├── .env              # Your credentials (never committed)
└── .gitignore
```
