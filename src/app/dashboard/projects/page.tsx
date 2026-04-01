"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { AppDispatch, RootState } from "@/store";
import { fetchProjectsStart, fetchProjectsSuccess, fetchProjectsFailure } from "@/store/projectSlice";
import { getUserProjects, setProjectAutoDeploy, syncProjectDeploy, ProjectResult } from "@/lib/api";
import { ExternalLink, RefreshCw, Activity, CheckCircle2, XCircle, Clock, Copy } from "lucide-react";

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

type DeploymentNotice = {
  appName: string;
  title: string;
  message: string;
  url: string;
  variant: "info" | "success";
};

type ProjectSummary = Pick<ProjectResult, "appName" | "status" | "url">;

const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function buildJenkinsLogWsUrl(job: string, build: string, token: string): string {
  const endpoint = new URL("/ws/jenkins/logs", backendBaseUrl);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set("job", job);
  endpoint.searchParams.set("build", build);
  endpoint.searchParams.set("token", token);
  return endpoint.toString();
}

function buildJenkinsQueueWsUrl(job: string, queueItemId: number, token: string): string {
  const endpoint = new URL("/ws/jenkins/logs", backendBaseUrl);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set("job", job);
  endpoint.searchParams.set("queueItem", String(queueItemId));
  endpoint.searchParams.set("token", token);
  return endpoint.toString();
}

export default function Projects() {
  const { data: session, status } = useSession();
  const dispatch = useDispatch<AppDispatch>();
  const { items: projects, loading, error } = useSelector((state: RootState) => state.projects);
  const [jobName, setJobName] = useState("deploy-pipeline");
  const [buildNumber, setBuildNumber] = useState("");
  const [syncingProjectId, setSyncingProjectId] = useState<string | null>(null);
  const [togglingProjectId, setTogglingProjectId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState("No active deployment stream.");
  const [logOutput, setLogOutput] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [currentQueueItem, setCurrentQueueItem] = useState<number | null>(null);
  const [currentBuildNumber, setCurrentBuildNumber] = useState<number | null>(null);
  const [deploymentNotice, setDeploymentNotice] = useState<DeploymentNotice | null>(null);
  const [copiedDeploymentUrl, setCopiedDeploymentUrl] = useState(false);
  const streamRef = useRef<WebSocket | null>(null);
  const logContainerRef = useRef<HTMLPreElement | null>(null);
  const backendToken = (session as SessionWithBackendToken | null)?.backendToken ?? null;

  const loadProjects = useCallback(async () => {
    if (!backendToken) {
      return;
    }

    dispatch(fetchProjectsStart());
    try {
      const data = await getUserProjects(backendToken);
      dispatch(fetchProjectsSuccess(data));
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load deployments";
      dispatch(fetchProjectsFailure(message));
      return null;
    }
  }, [backendToken, dispatch]);

  useEffect(() => {
    if (status === "authenticated") {
      void loadProjects();
    }
  }, [status, loadProjects]);

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

  async function copyDeploymentUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedDeploymentUrl(true);
      window.setTimeout(() => setCopiedDeploymentUrl(false), 1500);
    } catch {
      setCopiedDeploymentUrl(false);
    }
  }

  function stopStreaming() {
    if (streamRef.current) {
      streamRef.current.close(1000, "Manual stop");
      streamRef.current = null;
    }
    setIsStreaming(false);
    setStreamStatus("Stream stopped.");
  }

  function startStreaming() {
    const normalizedJob = jobName.trim();
    const normalizedBuild = buildNumber.trim();

    if (!normalizedJob) {
      setStreamError("Jenkins job is required.");
      return;
    }

    if (!/^\d+$/.test(normalizedBuild)) {
      setStreamError("Build number must be a numeric value.");
      return;
    }

    if (!backendToken) {
      setStreamError("Missing backend token. Please sign in again.");
      return;
    }

    stopStreaming();
    setLogOutput("");
    setStreamError(null);
    setIsStreaming(true);
    setCurrentQueueItem(null);
    setCurrentBuildNumber(Number(normalizedBuild));
    setStreamStatus(`Streaming Jenkins build #${normalizedBuild}...`);

    const socket = new WebSocket(buildJenkinsLogWsUrl(normalizedJob, normalizedBuild, backendToken));
    streamRef.current = socket;

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as JenkinsWsMessage;
        switch (message.type) {
          case "queued":
            setStreamStatus(message.message || "Waiting in Jenkins queue...");
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
            setStreamError(message.detail || message.message || "WebSocket stream error.");
            setIsStreaming(false);
            setStreamStatus("Stream failed.");
            return;
          case "done":
            setIsStreaming(false);
            setStreamStatus("Build completed.");
            socket.close(1000, "Log stream completed");
            return;
          default:
            return;
        }
      } catch {
        setLogOutput((prev) => prev + event.data);
      }
    };

    socket.onclose = () => {
      if (streamRef.current === socket) {
        streamRef.current = null;
      }
      setIsStreaming(false);
    };

    socket.onerror = () => {
      setStreamError("WebSocket stream failed. Verify backend URL, token, and Jenkins job/build.");
    };
  }

  function startQueueStreaming(job: string, queueItemId: number, project?: ProjectSummary | null) {
    if (!backendToken) {
      setStreamError("Missing backend token. Please sign in again.");
      return;
    }

    stopStreaming();
    setLogOutput("");
    setStreamError(null);
    setIsStreaming(true);
    setCurrentQueueItem(queueItemId);
    setCurrentBuildNumber(null);
    setStreamStatus(`Deployment queued (#${queueItemId}). Waiting for Jenkins build...`);

    const socket = new WebSocket(buildJenkinsQueueWsUrl(job, queueItemId, backendToken));
    streamRef.current = socket;

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as JenkinsWsMessage;
        switch (message.type) {
          case "queued":
            setStreamStatus(message.message || "Still waiting in Jenkins queue...");
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
            setStreamError(message.detail || message.message || "WebSocket stream error.");
            setIsStreaming(false);
            setStreamStatus("Stream failed.");
            return;
          case "done":
            setIsStreaming(false);
            setStreamStatus("Build completed. Your app domain is ready to open.");
            if (project?.url) {
              setDeploymentNotice({
                appName: project.appName,
                title: `${project.appName} deployment finished`,
                message:
                  project.status === "DEPLOYED"
                    ? "The deployment is live. Open the domain below to access it."
                    : "The pipeline finished. Open the domain below to access your app.",
                url: project.url,
                variant: "success",
              });
            }
            void loadProjects();
            socket.close(1000, "Log stream completed");
            return;
          default:
            return;
        }
      } catch {
        setLogOutput((prev) => prev + event.data);
      }
    };

    socket.onclose = () => {
      if (streamRef.current === socket) {
        streamRef.current = null;
      }
      setIsStreaming(false);
    };

    socket.onerror = () => {
      setStreamError("WebSocket stream failed. Verify backend URL, token, and Jenkins queue item.");
      setStreamStatus("Stream failed.");
    };
  }

  async function handleToggleAutoDeploy(projectId: string, nextEnabled: boolean) {
    if (!backendToken) {
      alert("Missing backend token. Please sign in again.");
      return;
    }

    try {
      setTogglingProjectId(projectId);
      await setProjectAutoDeploy(backendToken, projectId, nextEnabled);
      await loadProjects();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update auto deploy";
      alert(message);
    } finally {
      setTogglingProjectId(null);
    }
  }

  async function handleSyncProject(projectId: string) {
    if (!backendToken) {
      alert("Missing backend token. Please sign in again.");
      return;
    }

    try {
      setSyncingProjectId(projectId);
      setDeploymentNotice(null);
      setCopiedDeploymentUrl(false);
      const result = await syncProjectDeploy(backendToken, projectId);
      const currentProject = projects.find((project) => project.id === projectId) ?? null;
      await loadProjects();

      if (currentProject?.url) {
        setDeploymentNotice({
          appName: currentProject.appName,
          title: `${currentProject.appName} domain ready`,
          message:
            result.queueItemId && result.queueItemId > 0
              ? "Deployment queued. Keep this domain for when the pipeline completes."
              : "Deployment started. Open the domain below once the pipeline finishes.",
          url: currentProject.url,
          variant: "info",
        });
      }

      if (result.queueItemId && result.queueItemId > 0) {
        startQueueStreaming(result.jobName || jobName, result.queueItemId, currentProject);
      } else {
        setStreamError("Sync started, but queue item ID is missing.");
        setStreamStatus("Sync started without queue item.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to sync project";
      alert(message);
    } finally {
      setSyncingProjectId(null);
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "BUILDING":
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />;
      case "DEPLOYED":
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case "FAILED":
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "BUILDING":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "DEPLOYED":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "FAILED":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deployments</h1>
          <p className="text-gray-400 mt-1 text-sm">Monitor your active applications and their build status.</p>
        </div>
        <button
          onClick={loadProjects}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-md text-sm hover:bg-white/10 transition-colors"
        >
          <Activity className="h-4 w-4" />
          {loading ? "Syncing..." : "Sync"}
        </button>
      </div>

      {deploymentNotice ? (
        <div
          className={`mb-6 rounded-2xl border p-4 shadow-xl ${
            deploymentNotice.variant === "success"
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-sky-500/30 bg-sky-500/10"
          }`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className={`mt-0.5 h-5 w-5 ${
                  deploymentNotice.variant === "success" ? "text-emerald-300" : "text-sky-300"
                }`}
              />
              <div>
                <p className="text-sm font-semibold text-white">{deploymentNotice.title}</p>
                <p className="mt-1 text-sm text-gray-300">{deploymentNotice.message}</p>
                <p className="mt-2 text-xs text-gray-400">
                  <span className="text-gray-500">App:</span> {deploymentNotice.appName}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={deploymentNotice.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10"
                  >
                    Open app
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => void copyDeploymentUrl(deploymentNotice.url)}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:bg-black/30"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedDeploymentUrl ? "Copied URL" : "Copy URL"}
                  </button>
                  <span className="break-all text-xs text-gray-400">{deploymentNotice.url}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDeploymentNotice(null)}
              className="text-xs text-gray-400 transition-colors hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
        {error ? (
          <div className="p-12 text-center text-red-400">Error loading deployments: {error}</div>
        ) : projects.length === 0 && !loading ? (
          <div className="p-16 text-center text-gray-500 flex flex-col items-center">
            <Activity className="h-12 w-12 text-white/10 mb-4" />
            <p className="text-lg text-gray-300">No deployments yet.</p>
            <p className="mt-2 text-sm">Go to the Overview tab and select a repository to deploy.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
              <thead className="text-xs uppercase bg-white/5 text-gray-500">
                <tr>
                  <th scope="col" className="px-6 py-4 font-medium">Application</th>
                  <th scope="col" className="px-6 py-4 font-medium">Source Repo</th>
                  <th scope="col" className="px-6 py-4 font-medium text-center">Branch</th>
                  <th scope="col" className="px-6 py-4 font-medium text-center">Auto Deploy</th>
                  <th scope="col" className="px-6 py-4 font-medium text-center">Status</th>
                  <th scope="col" className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-medium text-white whitespace-nowrap">
                      <Link
                        href={`/dashboard/projects/${project.id}`}
                        className="hover:text-emerald-300 transition-colors"
                      >
                        {project.appName}
                      </Link>
                    </td>
                    <td className="px-6 py-4 truncate max-w-[200px]" title={project.repoUrl}>
                      {project.repoFullName || project.repoUrl.replace("https://github.com/", "")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-xs font-mono">
                        {project.branch}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => void handleToggleAutoDeploy(project.id, !project.autoDeployEnabled)}
                        disabled={togglingProjectId === project.id}
                        className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          project.autoDeployEnabled
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20"
                            : "bg-gray-500/10 text-gray-300 border-gray-500/20 hover:bg-gray-500/20"
                        }`}
                      >
                        {togglingProjectId === project.id
                          ? "Saving..."
                          : project.autoDeployEnabled
                            ? "Enabled"
                            : "Disabled"}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBg(project.status)}`}>
                          {getStatusIcon(project.status)}
                          {project.status}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => void handleSyncProject(project.id)}
                          disabled={syncingProjectId === project.id}
                          className="px-3 py-1.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {syncingProjectId === project.id ? "Syncing..." : "Sync Deploy"}
                        </button>
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="px-3 py-1.5 rounded border border-white/20 bg-white/5 text-gray-200 hover:bg-white/10 text-xs"
                        >
                          Config
                        </Link>
                        {project.status === "DEPLOYED" ? (
                          <a
                            href={project.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline transition-colors text-xs"
                          >
                            Visit <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8 bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Jenkins Live Logs</h2>
            <p className="text-sm text-gray-400 mt-1">{streamStatus}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {currentQueueItem ? <span className="bg-white/5 border border-white/10 rounded px-2 py-1">Queue: {currentQueueItem}</span> : null}
            {currentBuildNumber ? <span className="bg-white/5 border border-white/10 rounded px-2 py-1">Build: {currentBuildNumber}</span> : null}
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px_auto_auto] gap-3">
            <input
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="Jenkins job (ex: deploy-pipeline)"
              className="w-full px-3 py-2 rounded-md bg-black/30 border border-white/15 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <input
              value={buildNumber}
              onChange={(e) => setBuildNumber(e.target.value)}
              placeholder="Build number"
              inputMode="numeric"
              className="w-full px-3 py-2 rounded-md bg-black/30 border border-white/15 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <button
              onClick={startStreaming}
              disabled={isStreaming}
              className="px-4 py-2 rounded-md text-sm border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStreaming ? "Streaming..." : "Start Stream"}
            </button>
            <button
              onClick={stopStreaming}
              disabled={!isStreaming}
              className="px-4 py-2 rounded-md text-sm border border-white/20 bg-white/5 text-gray-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Stop
            </button>
          </div>

          {streamError ? (
            <p className="mt-3 text-sm text-red-400">{streamError}</p>
          ) : null}

          <pre
            ref={logContainerRef}
            className="mt-4 h-80 rounded-lg border border-white/10 bg-black/50 p-4 text-xs leading-5 text-emerald-300 font-mono whitespace-pre-wrap overflow-y-auto"
          >
            {logOutput || "No logs yet. Start the stream to watch Jenkins output in real time."}
          </pre>
        </div>
      </div>
    </div>
  );
}
