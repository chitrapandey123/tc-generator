import axios from "axios";

const BASE_URL = "http://localhost:8000";

// 1. Fetch stories from Jira
export const fetchStories = async (project = "QA") => {
  const resp = await axios.get(`${BASE_URL}/api/stories`, {
    params: { project },
  });
  return resp.data;
};

// 2. Generate TCs via Claude
export const generateTCs = async (stories) => {
  const resp = await axios.post(`${BASE_URL}/api/generate-tc`, { stories });
  return resp.data;
};

// 3. Get Xray token
export const getXrayToken = async () => {
  const resp = await axios.post(`${BASE_URL}/api/xray/token`, {});
  return resp.data.token;
};

// 4. Push TCs to Xray
export const pushToXray = async (projectKey, storyKey, testCases, xrayToken) => {
  const resp = await axios.post(`${BASE_URL}/api/xray/push`, {
    project_key: projectKey,
    story_key: storyKey,
    test_cases: testCases,
    xray_token: xrayToken,
  });
  return resp.data;
};

// 5. Fetch existing TCs for a story from Xray
export const fetchExistingTests = async (storyKey) => {
  const resp = await axios.get(`${BASE_URL}/api/xray/tests/${storyKey}`);
  return resp.data;
};

// Automate TC
export const generatePlaywright = async (payload) => {
  const resp = await axios.post(`${BASE_URL}/api/automate/generate`, payload);
  return resp.data;
};

export const mergePlaywright = async (payload) => {
  const resp = await axios.post(`${BASE_URL}/api/automate/merge`, payload);
  return resp.data;
};

// Decide which test file to use
export const decideTestFile = async (payload) => {
  const resp = await axios.post(`${BASE_URL}/api/automate/decide-file`, payload);
  return resp.data;
};
