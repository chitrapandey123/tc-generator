# Setup Guide

Step by step instructions to run the TC Generator on your machine.

---

## Prerequisites

Before you start, make sure you have these installed:

| Tool | Version | Download |
|------|---------|----------|
| Python | 3.9+ | https://www.python.org/downloads/ |
| Node.js | 18+ | https://nodejs.org/ |
| Git | Any | https://git-scm.com/ |

**Check your versions:**
```bash
python3 --version
node --version
git --version
```

---

## Step 1 — Clone the repo

```bash
git clone https://github.com/chitrapandey123/tc-generator.git
cd tc-generator
```

---

## Step 2 — Set up Backend

```bash
# Go to backend folder
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate        # Mac / Linux
venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Create your .env file
cp .env.example .env
```

Now open `.env` in any text editor and fill in your credentials:

```
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-personal-jira-token
JIRA_DOMAIN=<company>.atlassian.net
ANTHROPIC_API_KEY=get-this-from-team-lead
XRAY_CLIENT_ID=get-this-from-team-lead
XRAY_CLIENT_SECRET=get-this-from-team-lead
```

### Where to get each credential

**JIRA_EMAIL**
Your own work email that you use to log into Jira.

**JIRA_API_TOKEN**
Your personal Jira API token:
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**
3. Give it a name e.g. `tc-generator`
4. Copy the token and paste it in `.env`

**JIRA_DOMAIN**
The domain is the same for everyone on the team:
```
<company>.atlassian.net
```

**ANTHROPIC_API_KEY, XRAY_CLIENT_ID, XRAY_CLIENT_SECRET**
These are shared credentials — ask your team lead for these values.

---

## Step 3 — Run Backend

Make sure you are in the `backend/` folder with the virtual environment activated, then:

```bash
uvicorn main:app --reload
```

You should see:
```
JIRA_DOMAIN: <company>.atlassian.net
ANTHROPIC_API_KEY set: True
INFO:     Uvicorn running on http://127.0.0.1:8000
```

Backend is now running at `http://localhost:8000`

> **Tip:** You can test all API endpoints at `http://localhost:8000/docs`

---

## Step 4 — Set up Frontend

Open a **new terminal window** (keep the backend terminal running):

```bash
# Go to frontend folder
cd tc-generator/frontend

# Install dependencies
npm install

# Run frontend
npm run dev
```

You should see:
```
  VITE ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

---

## Step 5 — Open the App

Open your browser and go to:
```
http://localhost:5173
```

You should see the TC Generator UI with 4 steps:
1. Connect to Jira
2. Select Stories
3. Review Test Cases
4. Push to Xray

---

## How to Use

1. **Enter your project key** (e.g. `QA`) and click **Fetch Stories**
2. **Select stories** you want to generate test cases for
3. **Review and edit** the AI-generated test cases
4. **Push to Xray** — test cases are created and linked to stories automatically

---

## Running Both Servers

You need **two terminal windows** open at the same time:

| Terminal | Folder | Command |
|----------|--------|---------|
| Terminal 1 | `backend/` | `uvicorn main:app --reload` |
| Terminal 2 | `frontend/` | `npm run dev` |

---

## Troubleshooting

**Backend won't start — ModuleNotFoundError**
```bash
# Make sure venv is activated
source venv/bin/activate   # Mac/Linux
venv\Scripts\activate      # Windows

# Reinstall dependencies
pip install -r requirements.txt
```

**Frontend won't start — command not found**
```bash
# Make sure Node is installed
node --version

# Reinstall dependencies
npm install
```

**"Missing JIRA credentials" error**
- Make sure `.env` file exists in the `backend/` folder
- Make sure all values are filled in with no spaces around `=`
- Restart the backend after editing `.env`

**"Credit balance too low" error**
- The shared Anthropic API key is out of credits
- Contact your team lead to top up

**Stories not loading**
- Check your `JIRA_EMAIL` and `JIRA_API_TOKEN` are correct
- Make sure your Jira account has access to the project
- Try generating a new API token at https://id.atlassian.com/manage-profile/security/api-tokens

**Test cases not pushing to Xray**
- Make sure `XRAY_CLIENT_ID` and `XRAY_CLIENT_SECRET` are correct
- Xray tokens expire after 24 hours — the app handles this automatically

---

## Updating to Latest Version

When the team lead pushes updates:

```bash
cd tc-generator
git pull

# If backend dependencies changed
cd backend
pip install -r requirements.txt

# If frontend dependencies changed
cd frontend
npm install
```

---

## Project Structure

```
tc-generator/
├── README.md          ← project overview
├── SETUP.md           ← this file
├── .gitignore
├── backend/
│   ├── main.py        ← FastAPI server with all endpoints
│   ├── requirements.txt
│   ├── .env.example   ← template for your .env file
│   └── .env           ← your credentials (never committed)
└── frontend/
    ├── src/
    │   ├── App.jsx        ← main app
    │   ├── api.js         ← API calls
    │   └── components/
    │       ├── StoriesList.jsx
    │       ├── ReviewTC.jsx
    │       └── PushResults.jsx
    └── package.json
```

---

## Need Help?

Contact your team lead or open an issue on GitHub:
https://github.com/chitrapandey123/tc-generator/issues
