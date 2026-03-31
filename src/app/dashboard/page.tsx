"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import { AppDispatch, RootState } from "@/store";
import { fetchReposStart, fetchReposSuccess, fetchReposFailure } from "@/store/repoSlice";
import { connectProjectRepository, deployProject, getUserRepos, RepositoryConnectResult } from "@/lib/api";
import { Copy, Github, Plus, Search } from "lucide-react";

type SessionWithBackendToken = {
  backendToken?: string | null;
};

type JenkinsWsMessage = {
  type?: "open" | "queued" | "log" | "heartbeat" | "done" | "error";
  build?: number;
  queueItemId?: number;
  chunk?: string;
  message?: string;
  detail?: string;
};

const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function buildDeployWsUrl(jobName: string, token: string, queueItemId: number): string {
  const endpoint = new URL("/ws/jenkins/logs", backendBaseUrl);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set("job", jobName);
  endpoint.searchParams.set("queueItem", String(queueItemId));
  endpoint.searchParams.set("token", token);
  return endpoint.toString();
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const dispatch = useDispatch<AppDispatch>();
  const { items: repos, loading, error } = useSelector((state: RootState) => state.repos);
  const [search, setSearch] = useState("");
  const [autoDeployOnCreate, setAutoDeployOnCreate] = useState(true);
  const [webhookSetup, setWebhookSetup] = useState<RepositoryConnectResult | null>(null);
  const [webhookSetupError, setWebhookSetupError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<"url" | "secret" | null>(null);
  const [deployingRepo, setDeployingRepo] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState("No active deployment stream.");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [logOutput, setLogOutput] = useState("");
  const [currentJobName, setCurrentJobName] = useState<string | null>(null);
  const [currentQueueItem, setCurrentQueueItem] = useState<number | null>(null);
  const [currentBuildNumber, setCurrentBuildNumber] = useState<number | null>(null);
  const backendToken = (session as SessionWithBackendToken | null)?.backendToken ?? null;
  const streamRef = useRef<WebSocket | null>(null);
  const logContainerRef = useRef<HTMLPreElement | null>(null);

  const loadRepos = useCallback(async () => {
    if (!backendToken) {
      return;
    }

    dispatch(fetchReposStart());
    try {
      const data = await getUserRepos(backendToken);
      dispatch(fetchReposSuccess(data));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load repositories";
      dispatch(fetchReposFailure(message));
    }
  }, [backendToken, dispatch]);

  useEffect(() => {
    if (status === "authenticated" && repos.length === 0 && !loading) {
      void loadRepos();
    }
  }, [status, repos.length, loading, loadRepos]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.close(1000, "Page cleanup");
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!logContainerRef.current) {
      return;
    }
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [logOutput]);

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.close(1000, "Manual stop");
      streamRef.current = null;
    }
    setIsStreaming(false);
    setStreamStatus("Stream stopped.");
  }

  async function copyText(value: string, field: "url" | "secret") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      setCopiedField(null);
    }
  }

  function startDeployLogStream(token: string, jobName: string, queueItemId: number) {
    if (streamRef.current) {
      streamRef.current.close(1000, "Replacing existing stream");
      streamRef.current = null;
    }

    setCurrentJobName(jobName);
    setCurrentQueueItem(queueItemId);
    setCurrentBuildNumber(null);
    setStreamError(null);
    setLogOutput("");
    setIsStreaming(true);
    setStreamStatus(`Deployment queued. Waiting in Jenkins queue item #${queueItemId}...`);

    const socket = new WebSocket(buildDeployWsUrl(jobName, token, queueItemId));
    streamRef.current = socket;

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as JenkinsWsMessage;
        switch (message.type) {
          case "queued":
            setStreamStatus(message.message || "Still waiting for Jenkins to assign build number...");
            if (typeof message.queueItemId === "number") {
              setCurrentQueueItem(message.queueItemId);
            }
            return;
          case "open":
            if (typeof message.build === "number") {
              setCurrentBuildNumber(message.build);
              setStreamStatus(`Streaming Jenkins build #${message.build}`);
            } else {
              setStreamStatus("Streaming Jenkins logs...");
            }
            return;
          case "log":
            setLogOutput((prev) => prev + (message.chunk || ""));
            return;
          case "error":
            setIsStreaming(false);
            setStreamError(message.detail || message.message || "Deployment stream failed.");
            return;
          case "done":
            setIsStreaming(false);
            setStreamStatus("Build completed.");
            socket.close(1000, "Build completed");
            return;
          default:
            return;
        }
      } catch {
        setLogOutput((prev) => prev + event.data);
      }
    };

    socket.onerror = () => {
      setIsStreaming(false);
      setStreamError("WebSocket stream failed. Check backend connectivity and token.");
    };

    socket.onclose = () => {
      if (streamRef.current === socket) {
        streamRef.current = null;
      }
      setIsStreaming(false);
    };
  }

  async function handleDeploy(repoUrl: string, branch: string, repoFullName: string) {
    if (!backendToken) {
      alert("Missing backend token. Please sign in again.");
      return;
    }

    try {
      setDeployingRepo(repoFullName);
      setWebhookSetup(null);
      setWebhookSetupError(null);
      setCopiedField(null);
      // Generate safe app name from repo name (e.g. org/repo-name -> repo-name-org)
      const cleanName = repoFullName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().substring(0, 30);
      const randomSuffix = Math.floor(Math.random() * 10000);
      const appName = `${cleanName}-${randomSuffix}`;

      const result = await deployProject(backendToken, branch, repoUrl, appName, 3000);

      if (result.project?.id) {
        try {
          const setup = await connectProjectRepository(backendToken, result.project.id, {
            repoProvider: "github",
            repoUrl,
            repoFullName,
            branch,
            autoDeployEnabled: autoDeployOnCreate,
          });
          setWebhookSetup(setup);
        } catch (connectError: unknown) {
          const message = connectError instanceof Error ? connectError.message : "Failed to configure webhook";
          setWebhookSetupError(
            `Deployment started, but webhook setup failed. You can retry from Projects page. (${message})`
          );
        }
      } else {
        setWebhookSetupError("Deployment started, but project ID is missing so webhook setup was skipped.");
      }

      const queueItemId = result.queueItemId;
      const jobName = result.jenkinsJobName || "deploy-pipeline";

      if (queueItemId && queueItemId > 0) {
        startDeployLogStream(backendToken, jobName, queueItemId);
      } else {
        setStreamStatus("Deployment triggered, but queue item ID is missing. Stream did not start.");
        setStreamError("Missing queue item from backend deploy response.");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown deployment error";
      alert("Failed to deploy: " + message);
    } finally {
      setDeployingRepo(null);
    }
  }

  const filteredRepos = repos.filter((repo) => repo.fullName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Let&apos;s build something new.</h1>
          <p className="text-gray-400 mt-1 text-sm">Select a repository from your GitHub account to deploy.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-gray-300 bg-white/5 border border-white/10 rounded-md px-3 py-2">
            <input
              type="checkbox"
              checked={autoDeployOnCreate}
              onChange={(event) => setAutoDeployOnCreate(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/30 bg-black/40"
            />
            Enable auto-deploy webhook on create
          </label>
          <button
            onClick={() => void loadRepos()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-md text-sm hover:bg-white/10 transition-colors"
          >
            {loading ? "Refreshing..." : "Refresh list"}
          </button>
        </div>
      </div>

      <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <Github className="h-5 w-5 text-gray-400" />
          <div className="flex-1 relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search repositories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-md py-2 pl-9 pr-4 text-sm outline-none focus:border-gray-500 transition-colors"
            />
          </div>
        </div>

        <div className="divide-y divide-white/10 max-h-[600px] overflow-auto">
          {loading && repos.length === 0 ? (
            <div className="p-12 text-center text-gray-500">Loading repositories...</div>
          ) : error ? (
            <div className="p-12 text-center text-red-400">Error loading repositories: {error}</div>
          ) : filteredRepos.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No repositories found.</div>
          ) : (
            filteredRepos.map((repo) => (
              <div key={repo.cloneUrl} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-white/[0.02] transition-colors gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white truncate">{repo.fullName}</span>
                    {repo.isPrivate && (
                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-medium text-gray-300">Private</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">{repo.description || "No description provided."}</p>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded">
                    {repo.defaultBranch}
                  </div>
                  <button
                    onClick={() => handleDeploy(repo.cloneUrl, repo.defaultBranch, repo.fullName)}
                    disabled={deployingRepo === repo.fullName}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-medium rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {deployingRepo === repo.fullName ? (
                      <div className="h-4 w-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Deploy
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {webhookSetupError ? (
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {webhookSetupError}
        </div>
      ) : null}

      {webhookSetup ? (
        <div className="mt-8 bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-medium text-white">Webhook Setup</h2>
            <p className="text-xs text-gray-400 mt-1">
              {webhookSetup.webhookAutoCreated
                ? "GitHub webhook was created automatically. New commits on the selected branch will auto-deploy."
                : "Auto-creation was not completed. Add this webhook manually in GitHub repo settings."}
            </p>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-gray-400 mb-1">Repository</p>
              <p className="text-white break-all">{webhookSetup.repoFullName}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-gray-400 mb-1">Branch</p>
              <p className="text-white">{webhookSetup.branch}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-gray-400 mb-1">Auto Deploy</p>
              <p className="text-white">{webhookSetup.autoDeployEnabled ? "Enabled" : "Disabled"}</p>
            </div>
          </div>

          {!webhookSetup.webhookAutoCreated ? (
            <div className="px-4 pb-4 space-y-3">
              <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                <p className="text-xs text-gray-400 mb-1">Payload URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] text-emerald-300 break-all">{webhookSetup.webhook.url}</code>
                  <button
                    onClick={() => void copyText(webhookSetup.webhook.url, "url")}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/20 bg-white/5 text-gray-200 hover:bg-white/10"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedField === "url" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                <p className="text-xs text-gray-400 mb-1">Webhook Secret</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] text-emerald-300 break-all">{webhookSetup.webhook.secret}</code>
                  <button
                    onClick={() => void copyText(webhookSetup.webhook.secret, "secret")}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/20 bg-white/5 text-gray-200 hover:bg-white/10"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedField === "secret" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-white">Live Deploy Logs</h2>
            <p className="text-xs text-gray-400 mt-1">{streamStatus}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {currentJobName ? <span className="bg-white/5 border border-white/10 rounded px-2 py-1">Job: {currentJobName}</span> : null}
            {currentQueueItem ? <span className="bg-white/5 border border-white/10 rounded px-2 py-1">Queue: {currentQueueItem}</span> : null}
            {currentBuildNumber ? <span className="bg-white/5 border border-white/10 rounded px-2 py-1">Build: {currentBuildNumber}</span> : null}
            <button
              onClick={stopStream}
              disabled={!isStreaming}
              className="px-3 py-1 rounded border border-white/20 bg-white/5 text-gray-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Stop
            </button>
          </div>
        </div>

        {streamError ? (
          <div className="px-4 py-2 text-sm text-red-400 border-b border-white/10">{streamError}</div>
        ) : null}

        <pre
          ref={logContainerRef}
          className="h-80 p-4 text-xs leading-5 text-emerald-300 font-mono whitespace-pre-wrap overflow-y-auto bg-black/50"
        >
          {logOutput || "Click Deploy to start streaming Jenkins logs in real time."}
        </pre>
      </div>
    </div>
  );
}
