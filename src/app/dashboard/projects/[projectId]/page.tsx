"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  createProjectWebhook,
  deleteProjectWebhook,
  getProjectById,
  getProjectWebhook,
  ProjectResult,
  rotateProjectWebhook,
  setProjectAutoDeploy,
  syncProjectDeploy,
  WebhookDetailsResult,
} from "@/lib/api";
import { CheckCircle2, Copy, ExternalLink, RefreshCw, Settings2, Webhook } from "lucide-react";

type SessionWithBackendToken = {
  backendToken?: string | null;
};

type TabKey = "overview" | "config" | "webhook";

type DeploymentNotice = {
  appName: string;
  title: string;
  message: string;
  url: string;
  variant: "info" | "success";
};

export default function ProjectDetailsPage() {
  const { data: session } = useSession();
  const params = useParams<{ projectId: string }>();
  const rawProjectId = params?.projectId;
  const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
  const backendToken = (session as SessionWithBackendToken | null)?.backendToken ?? null;

  const [tab, setTab] = useState<TabKey>("overview");
  const [project, setProject] = useState<ProjectResult | null>(null);
  const [webhook, setWebhook] = useState<WebhookDetailsResult | null>(null);
  const [webhookName, setWebhookName] = useState("");
  const [createOnProvider, setCreateOnProvider] = useState(true);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingAutoDeploy, setSavingAutoDeploy] = useState(false);
  const [busyWebhookAction, setBusyWebhookAction] = useState<"save" | "rotate" | "delete" | null>(null);
  const [copiedField, setCopiedField] = useState<"url" | "secret" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [deploymentNotice, setDeploymentNotice] = useState<DeploymentNotice | null>(null);

  const autoDeployEnabled = webhook?.autoDeployEnabled ?? project?.autoDeployEnabled ?? false;

  const statusClass = useMemo(() => {
    if (!project) return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    switch (project.status) {
      case "DEPLOYED":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "BUILDING":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "FAILED":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  }, [project]);

  const loadProject = useCallback(async () => {
    if (!backendToken || !projectId) return;

    setLoading(true);
    setError(null);
    try {
      const [projectPayload, webhookPayload] = await Promise.all([
        getProjectById(backendToken, projectId),
        getProjectWebhook(backendToken, projectId),
      ]);
      setProject(projectPayload);
      setWebhook(webhookPayload);
      setWebhookName(webhookPayload.name || `${projectPayload.appName}-webhook`);
      return projectPayload;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load project details";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [backendToken, projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (project?.url) {
      setDeploymentNotice({
        appName: project.appName,
        title: project.status === "DEPLOYED" ? `${project.appName} is live` : `${project.appName} domain ready`,
        message:
          project.status === "DEPLOYED"
            ? "Deployment is live. Open the domain below to access it."
            : "This is the live domain for the app. Keep it handy while the pipeline finishes.",
        url: project.url,
        variant: project.status === "DEPLOYED" ? "success" : "info",
      });
    } else {
      setDeploymentNotice(null);
    }
  }, [project]);

  async function copyText(value: string, field: "url" | "secret") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1200);
    } catch {
      setCopiedField(null);
    }
  }

  async function handleSyncDeploy() {
    if (!backendToken || !projectId) return;
    setSyncing(true);
    setError(null);
    setInfo(null);
    try {
      const syncResult = await syncProjectDeploy(backendToken, projectId);
      setInfo(
        syncResult.queueItemId
          ? `Sync accepted. Queue item #${syncResult.queueItemId}`
          : "Sync accepted. Jenkins queue item not available."
      );
      const refreshedProject = await loadProject();
      if (refreshedProject?.url) {
        setDeploymentNotice({
          appName: refreshedProject.appName,
          title:
            refreshedProject.status === "DEPLOYED"
              ? `${refreshedProject.appName} is live`
              : `${refreshedProject.appName} domain ready`,
          message:
            refreshedProject.status === "DEPLOYED"
              ? "Deployment completed successfully. Open the domain below."
              : "Deployment triggered. Use the domain below once the pipeline completes.",
          url: refreshedProject.url,
          variant: refreshedProject.status === "DEPLOYED" ? "success" : "info",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to sync project";
      setError(message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggleAutoDeploy(nextEnabled: boolean) {
    if (!backendToken || !projectId) return;
    setSavingAutoDeploy(true);
    setError(null);
    setInfo(null);
    try {
      await setProjectAutoDeploy(backendToken, projectId, nextEnabled);
      setProject((prev) => (prev ? { ...prev, autoDeployEnabled: nextEnabled } : prev));
      setWebhook((prev) => (prev ? { ...prev, autoDeployEnabled: nextEnabled } : prev));
      setInfo(`Auto deploy ${nextEnabled ? "enabled" : "disabled"}.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update auto deploy";
      setError(message);
    } finally {
      setSavingAutoDeploy(false);
    }
  }

  async function handleSaveWebhook() {
    if (!backendToken || !projectId) return;
    const normalizedName = webhookName.trim();
    if (!normalizedName) {
      setError("Webhook name is required.");
      return;
    }

    setBusyWebhookAction("save");
    setError(null);
    setInfo(null);
    try {
      const payload = await createProjectWebhook(backendToken, projectId, {
        name: normalizedName,
        autoDeployEnabled,
        createOnProvider,
      });
      setWebhook(payload);
      setWebhookName(payload.name || normalizedName);
      setProject((prev) => (prev ? { ...prev, autoDeployEnabled: payload.autoDeployEnabled } : prev));
      setInfo(payload.webhookAutoCreated ? "Webhook synced to GitHub." : "Webhook saved locally.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save webhook";
      setError(message);
    } finally {
      setBusyWebhookAction(null);
    }
  }

  async function handleRotateWebhookSecret() {
    if (!backendToken || !projectId) return;
    setBusyWebhookAction("rotate");
    setError(null);
    setInfo(null);
    try {
      const payload = await rotateProjectWebhook(backendToken, projectId);
      setWebhook(payload);
      setInfo(payload.syncedProvider ? "Secret rotated and synced." : "Secret rotated locally.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to rotate webhook secret";
      setError(message);
    } finally {
      setBusyWebhookAction(null);
    }
  }

  async function handleDeleteWebhook() {
    if (!backendToken || !projectId) return;
    const confirmed = window.confirm("Delete webhook and disable auto deploy for this project?");
    if (!confirmed) return;

    setBusyWebhookAction("delete");
    setError(null);
    setInfo(null);
    try {
      await deleteProjectWebhook(backendToken, projectId);
      await loadProject();
      setInfo("Webhook deleted.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete webhook";
      setError(message);
    } finally {
      setBusyWebhookAction(null);
    }
  }

  if (!projectId) {
    return <p className="text-red-400">Invalid project id.</p>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Project</p>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {project?.appName || "Loading..."}
          </h1>
          <p className="text-sm text-gray-400 mt-1">{project?.repoFullName || project?.repoUrl || "—"}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex border rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}>
            {project?.status || "UNKNOWN"}
          </span>
          <button
            onClick={() => void handleSyncDeploy()}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300 hover:bg-blue-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Deploy"}
          </button>
          {project?.status === "DEPLOYED" && project.url ? (
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20"
            >
              Visit <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
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
                    onClick={() => void copyText(deploymentNotice.url, "url")}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:bg-black/30"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedField === "url" ? "Copied URL" : "Copy URL"}
                  </button>
                  <span className="break-all text-xs text-gray-400">{deploymentNotice.url}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setTab("overview")}
          className={`rounded-md border px-3 py-2 text-sm ${
            tab === "overview"
              ? "border-white/30 bg-white/10 text-white"
              : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab("config")}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            tab === "config"
              ? "border-white/30 bg-white/10 text-white"
              : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
          }`}
        >
          <Settings2 className="h-4 w-4" />
          Config
        </button>
        <button
          onClick={() => setTab("webhook")}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            tab === "webhook"
              ? "border-white/30 bg-white/10 text-white"
              : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
          }`}
        >
          <Webhook className="h-4 w-4" />
          Webhook
        </button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {info ? <p className="mb-4 text-sm text-emerald-300">{info}</p> : null}

      {tab === "overview" ? (
        <div className="rounded-xl border border-white/10 bg-[#111] p-5 space-y-3">
          {loading ? <p className="text-sm text-gray-400">Loading project details...</p> : null}
          <p className="text-sm text-gray-300">
            <span className="text-gray-500">Branch:</span> {project?.branch || "—"}
          </p>
          <p className="text-sm text-gray-300">
            <span className="text-gray-500">Repository:</span> {project?.repoUrl || "—"}
          </p>
          <p className="text-sm text-gray-300">
            <span className="text-gray-500">Project URL:</span>{" "}
            {project?.url ? (
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 hover:underline"
              >
                {project.url}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              "—"
            )}
          </p>
          <p className="text-sm text-gray-300">
            <span className="text-gray-500">Workspace ID:</span> {project?.workspaceId || "—"}
          </p>
          <div className="pt-3">
            <Link
              href="/dashboard/projects"
              className="text-xs text-gray-400 hover:text-white hover:underline"
            >
              Back to all deployments
            </Link>
          </div>
        </div>
      ) : null}

      {tab === "config" ? (
        <div className="rounded-xl border border-white/10 bg-[#111] p-5 space-y-4">
          <div className="rounded-lg border border-white/10 bg-black/30 p-4">
            <p className="text-sm text-gray-300">Auto Deploy</p>
            <p className="text-xs text-gray-500 mt-1">
              When enabled, new commits on the tracked branch trigger your pipeline automatically.
            </p>
            <div className="mt-3">
              <button
                onClick={() => void handleToggleAutoDeploy(!autoDeployEnabled)}
                disabled={savingAutoDeploy}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors disabled:opacity-50 ${
                  autoDeployEnabled
                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20"
                    : "bg-gray-500/10 text-gray-300 border-gray-500/20 hover:bg-gray-500/20"
                }`}
              >
                {savingAutoDeploy ? "Saving..." : autoDeployEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/30 p-4 space-y-2">
            <p className="text-sm text-gray-300">Runtime</p>
            <p className="text-xs text-gray-500">
              <span className="text-gray-400">App Port:</span> {project?.appPort ?? 3000}
            </p>
            <p className="text-xs text-gray-500">
              <span className="text-gray-400">Branch:</span> {project?.branch || "—"}
            </p>
          </div>
        </div>
      ) : null}

      {tab === "webhook" ? (
        <div className="rounded-xl border border-white/10 bg-[#111] p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2">Webhook Name</label>
            <input
              value={webhookName}
              onChange={(event) => setWebhookName(event.target.value)}
              placeholder="my-project-webhook"
              className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={autoDeployEnabled}
              onChange={(event) => void handleToggleAutoDeploy(event.target.checked)}
            />
            Enable Auto Deploy
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-gray-300 ml-4">
            <input
              type="checkbox"
              checked={createOnProvider}
              onChange={(event) => setCreateOnProvider(event.target.checked)}
            />
            Sync Webhook To GitHub
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void handleSaveWebhook()}
              disabled={busyWebhookAction !== null}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {busyWebhookAction === "save" ? "Saving..." : "Create / Update"}
            </button>
            <button
              onClick={() => void handleRotateWebhookSecret()}
              disabled={busyWebhookAction !== null || !webhook?.webhookConfigured}
              className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300 hover:bg-blue-500/20 disabled:opacity-50"
            >
              {busyWebhookAction === "rotate" ? "Rotating..." : "Rotate Secret"}
            </button>
            <button
              onClick={() => void handleDeleteWebhook()}
              disabled={busyWebhookAction !== null || !webhook?.webhookConfigured}
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              {busyWebhookAction === "delete" ? "Deleting..." : "Delete"}
            </button>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/30 p-4 space-y-3">
            <p className="text-xs text-gray-400">
              Status:{" "}
              <span className="text-gray-200">
                {webhook?.webhookConfigured ? "Configured" : "Not configured"}
              </span>
            </p>
            <p className="text-xs text-gray-400">
              Provider Hook ID:{" "}
              <span className="text-gray-200">{webhook?.webhookProviderId || "N/A"}</span>
            </p>

            {webhook?.webhook?.url ? (
              <div>
                <p className="text-xs text-gray-400 mb-1">Payload URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-[11px] text-emerald-300">{webhook.webhook.url}</code>
                  <button
                    onClick={() => void copyText(webhook.webhook.url, "url")}
                    className="rounded border border-white/20 bg-white/5 px-2 py-1 text-xs text-gray-200 hover:bg-white/10"
                  >
                    {copiedField === "url" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            ) : null}

            {webhook?.webhook?.secret ? (
              <div>
                <p className="text-xs text-gray-400 mb-1">Secret</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-[11px] text-emerald-300">{webhook.webhook.secret}</code>
                  <button
                    onClick={() => void copyText(webhook.webhook.secret || "", "secret")}
                    className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/5 px-2 py-1 text-xs text-gray-200 hover:bg-white/10"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedField === "secret" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">Secret not available yet. Create or rotate webhook first.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
