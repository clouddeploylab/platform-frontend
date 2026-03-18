const processEnvUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

async function fetchWithAuth(url: string, token: string, options: RequestInit = {}) {
  if (!token) {
    throw new Error("Unauthorized: No token provided");
  }

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(`${processEnvUrl}${url}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`API returned ${res.status}: ${errorBody}`);
  }

  return res;
}

export async function getUserRepos(token: string) {
  const res = await fetchWithAuth("/api/v1/repos", token);
  return res.json();
}

export async function getUserProjects(token: string) {
  const res = await fetchWithAuth("/api/v1/projects", token);
  return res.json();
}

export async function deployProject(token: string, branch: string, repoUrl: string, appName: string, appPort: number = 3000) {
  const res = await fetchWithAuth("/api/v1/projects", token, {
    method: "POST",
    body: JSON.stringify({ branch, repoUrl, appName, appPort }),
  });
  return res.json();
}
