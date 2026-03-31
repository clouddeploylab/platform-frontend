const processEnvUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface DeployResult {
  project: {
    id: string;
    appName: string;
    repoUrl: string;
    branch: string;
    status: string;
    url: string;
    appPort: number;
  };
  jenkinsJobName?: string | null;
  queueUrl?: string | null;
  queueItemId?: number | null;
}

export interface RepositoryConnectPayload {
  repoProvider: string;
  repoUrl: string;
  repoFullName: string;
  branch: string;
  autoDeployEnabled?: boolean;
}

export interface RepositoryConnectResult {
  projectId: string;
  repoProvider: string;
  repoFullName: string;
  branch: string;
  webhookName?: string | null;
  webhookProviderId?: string | null;
  autoDeployEnabled: boolean;
  webhookAutoCreated: boolean;
  webhook: {
    url: string;
    secret: string;
    events: string;
  };
}

export interface SyncDeployResult {
  status: string;
  jobName?: string | null;
  queueUrl?: string | null;
  queueItemId?: number | null;
}

export interface WebhookDetailsResult {
  projectId: string;
  repoProvider: string;
  repoFullName: string;
  branch: string;
  name?: string | null;
  autoDeployEnabled: boolean;
  webhookConfigured: boolean;
  webhookProviderId?: string | null;
  webhookAutoCreated?: boolean;
  syncedProvider?: boolean;
  webhook: {
    url: string;
    events: string;
    secret?: string;
  };
}

export interface WebhookCreatePayload {
  name: string;
  autoDeployEnabled?: boolean;
  createOnProvider?: boolean;
}

export interface WorkspaceDetailsResult {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  projectCount: number;
  createdAt: string;
}

export interface ProjectResult {
  id: string;
  userId: string;
  workspaceId: string;
  appName: string;
  repoUrl: string;
  branch: string;
  framework?: string | null;
  status: string;
  url: string;
  appPort: number;
  repoProvider?: string;
  repoFullName?: string | null;
  webhookName?: string | null;
  webhookProviderId?: string | null;
  autoDeployEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

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
  return res.json() as Promise<ProjectResult[]>;
}

export async function getProjectById(token: string, projectId: string) {
  const res = await fetchWithAuth(`/api/v1/projects/${projectId}`, token);
  return res.json() as Promise<ProjectResult>;
}

export async function deployProject(token: string, branch: string, repoUrl: string, appName: string, appPort: number = 3000) {
  const res = await fetchWithAuth("/api/v1/projects", token, {
    method: "POST",
    body: JSON.stringify({ branch, repoUrl, appName, appPort }),
  });
  return res.json() as Promise<DeployResult>;
}

export async function connectProjectRepository(
  token: string,
  projectId: string,
  payload: RepositoryConnectPayload
) {
  const res = await fetchWithAuth(`/api/v1/projects/${projectId}/repository/connect`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<RepositoryConnectResult>;
}

export async function setProjectAutoDeploy(token: string, projectId: string, enabled: boolean) {
  const res = await fetchWithAuth(`/api/v1/projects/${projectId}/auto-deploy`, token, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
  return res.json();
}

export async function syncProjectDeploy(token: string, projectId: string) {
  const res = await fetchWithAuth(`/api/v1/projects/${projectId}/sync`, token, {
    method: "POST",
  });
  return res.json() as Promise<SyncDeployResult>;
}

export async function getProjectWebhook(token: string, projectId: string) {
  const res = await fetchWithAuth(`/api/v1/projects/${projectId}/webhook`, token);
  return res.json() as Promise<WebhookDetailsResult>;
}

export async function createProjectWebhook(token: string, projectId: string, payload: WebhookCreatePayload) {
  const res = await fetchWithAuth(`/api/v1/projects/${projectId}/webhook`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<WebhookDetailsResult>;
}

export async function rotateProjectWebhook(token: string, projectId: string) {
  const res = await fetchWithAuth(`/api/v1/projects/${projectId}/webhook/rotate`, token, {
    method: "POST",
  });
  return res.json() as Promise<WebhookDetailsResult>;
}

export async function deleteProjectWebhook(token: string, projectId: string) {
  const res = await fetchWithAuth(`/api/v1/projects/${projectId}/webhook`, token, {
    method: "DELETE",
  });
  return res.json();
}

export async function getMyWorkspace(token: string) {
  const res = await fetchWithAuth("/api/v1/workspaces/me", token);
  return res.json() as Promise<WorkspaceDetailsResult>;
}
