# TC Generator — Jira + Claude AI + Xray

An AI-powered test case generation tool that fetches user stories from Jira, uses Claude AI to generate comprehensive test cases, and pushes them directly to Xray Test Management — all through a clean React UI.

---

## Demo

**Full flow:**
1. Connect to Jira and fetch stories
2. Select stories to generate test cases for
3. Review and edit AI-generated test cases
4. Push to Xray with automatic linking to requirements

---

## Tech Stack

**Frontend**
- React 18 + Vite
- Axios for API calls

**Backend**
- Python FastAPI
- httpx for async HTTP calls
- python-dotenv for environment management

**Integrations**
- Jira REST API — fetch stories via JQL
- Anthropic Claude API — AI test case generation
- Xray Cloud GraphQL API — create and manage test cases
- Xray Cloud REST API — authentication

---

## Features

- Fetch Jira stories by project, status, and sprint
- AI-generated test cases covering positive, negative, edge case, security, and performance scenarios
- Each TC includes preconditions, step-by-step actions, test data, and expected results
- Inline editing of test cases before pushing
- Select/deselect individual TCs before pushing
- Auto-creates Test issues in Xray with full step details
- Auto-links each Test to its parent Jira story as a requirement
- Push results screen with direct links to created issues

---

## Architecture

```
React UI (port 5174)
      ↓
FastAPI Backend (port 8000)
      ↓
┌─────────────────────────────┐
│  Jira REST API              │  ← fetch stories
│  Anthropic Claude API       │  ← generate TCs
│  Xray Cloud GraphQL API     │  ← create tests
│  Xray Cloud REST API        │  ← authenticate
└─────────────────────────────┘
```

---

## Project Structure

```
tc-generator/
├── backend/        # FastAPI backend
│   ├── main.py                 # All API endpoints
│   ├── requirements.txt        # Python dependencies
│   └── .env.example            # Environment variables template
│
└── frontend/            # React frontend
    ├── src/
    │   ├── App.jsx             # Main app with step navigation
    │   ├── api.js              # API calls to FastAPI
    │   └── components/
    │       ├── StoriesList.jsx # Story selection screen
    │       ├── ReviewTC.jsx    # TC review and editing screen
    │       └── PushResults.jsx # Push results screen
    └── package.json
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stories` | Fetch stories from Jira via JQL |
| POST | `/api/generate-tc` | Generate test cases using Claude AI |
| POST | `/api/xray/token` | Authenticate with Xray Cloud |
| POST | `/api/xray/push` | Push test cases to Xray |
| GET | `/api/link-types` | Debug: list Jira issue link types |

---

## Setup & Installation

### Prerequisites
- Python 3.9+
- Node.js 18+
- Jira Cloud account with API token
- Anthropic API key
- Xray Cloud installed on Jira (company-managed project)

### Backend Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/tc-generator.git

# Set up backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run backend
uvicorn main:app --reload
# Backend runs at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Frontend Setup

```bash
# Set up frontend
cd frontend
npm install

# Run frontend
npm run dev
# Frontend runs at http://localhost:5174
```

### Environment Variables

Create a `.env` file in `backend/` with:

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

## How It Works

### 1. Fetch Stories
The backend calls the Jira REST API using JQL to fetch stories from your project. Jira's ADF (Atlassian Document Format) descriptions are parsed into plain text.

### 2. Generate Test Cases
Selected stories are sent to the Anthropic Claude API with a structured prompt that instructs Claude to generate test cases in a specific JSON format. Each test case includes:
- Title
- Type (Positive/Negative/Edge Case/Security/Performance)
- Priority (High/Medium/Low)
- Preconditions
- Steps with action, test data, and expected result

### 3. Push to Xray
For each test case:
1. Authenticate with Xray Cloud to get a Bearer token
2. Create a Test issue in Xray using the GraphQL `createTest` mutation with all steps
3. Link the Test back to its parent Story using the Jira REST API issue link endpoint with the "Test" link type

---

## Screenshots

### Story Selection
Select which Jira stories to generate test cases for.

### Test Case Review
Review, edit, and select test cases before pushing to Xray.

### Push Results
See which test cases were successfully created with direct links to Xray.

---

## Key Technical Decisions

**Why FastAPI?**
FastAPI's async support handles concurrent API calls to Jira, Claude, and Xray efficiently. Auto-generated Swagger docs at `/docs` make testing endpoints easy.

**Why Xray GraphQL for creating tests?**
Xray Cloud's preferred API for managing test entities is GraphQL. The `createTest` mutation allows creating a test with all steps in a single call.

**Why Jira REST API for linking?**
The "Test" link type is a Jira-native issue link installed by Xray. It lives in Jira's issue linking system, so the Jira REST API is the correct way to create it.

**Why structured prompts?**
Asking Claude to return a specific JSON format ensures consistent, parseable output that maps directly to Xray's test step format (action, data, result).

---

## Future Improvements

- [ ] Sprint filter on stories screen
- [ ] Bulk generate TCs for all stories at once
- [ ] Export test cases to CSV/Excel
- [ ] OAuth 2.0 authentication instead of API tokens
- [ ] Deploy backend to Railway, frontend to Vercel
- [ ] Add test case templates per story type
- [ ] Support for Gherkin/BDD format

---

## Author

Built as a portfolio project demonstrating full-stack development with AI integration.

**Skills demonstrated:**
- REST API design with FastAPI
- React component architecture
- Third-party API integration (Jira, Claude, Xray)
- GraphQL mutations
- Async Python with httpx
- Environment-based configuration
- Git workflow

