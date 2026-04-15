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
