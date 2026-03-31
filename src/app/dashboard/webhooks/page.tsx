"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  createProjectWebhook,
  deleteProjectWebhook,
  getProjectWebhook,
  getUserProjects,
  rotateProjectWebhook,
  WebhookDetailsResult,
} from "@/lib/api";
import { Copy, RefreshCw, Trash2 } from "lucide-react";

type SessionWithBackendToken = {
  backendToken?: string | null;
};

type ProjectOption = {
  id: string;
  appName: string;
  repoFullName?: string | null;
  repoUrl: string;
  branch: string;
};

export default function WebhooksPage() {
  const { data: session, status } = useSession();
  const backendToken = (session as SessionWithBackendToken | null)?.backendToken ?? null;

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [details, setDetails] = useState<WebhookDetailsResult | null>(null);
  const [webhookName, setWebhookName] = useState("");
  const [createOnProvider, setCreateOnProvider] = useState(true);
  const [busy, setBusy] = useState<"create" | "rotate" | "delete" | null>(null);
  const [copiedField, setCopiedField] = useState<"url" | "secret" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const loadProjects = useCallback(async () => {
    if (!backendToken) return;

    setProjectsLoading(true);
    setError(null);
    try {
      const data = (await getUserProjects(backendToken)) as ProjectOption[];
      setProjects(data);
      if (!selectedProjectId && data.length > 0) {
        setSelectedProjectId(data[0].id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load projects";
      setError(message);
    } finally {
      setProjectsLoading(false);
    }
  }, [backendToken, selectedProjectId]);

  const loadWebhookDetails = useCallback(async () => {
    if (!backendToken || !selectedProjectId) return;

    setError(null);
    try {
      const payload = await getProjectWebhook(backendToken, selectedProjectId);
      setDetails(payload);
      setWebhookName(payload.name || `${selectedProject?.appName || "project"}-webhook`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load webhook details";
      setError(message);
    }
  }, [backendToken, selectedProjectId, selectedProject?.appName]);

  useEffect(() => {
    if (status === "authenticated") {
      void loadProjects();
    }
  }, [status, loadProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      void loadWebhookDetails();
    } else {
      setDetails(null);
      setWebhookName("");
    }
  }, [selectedProjectId, loadWebhookDetails]);

  async function copyText(value: string, field: "url" | "secret") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1200);
    } catch {
      setCopiedField(null);
    }
  }

  async function handleCreateWebhook() {
    if (!backendToken || !selectedProjectId) return;
    const normalizedName = webhookName.trim();
    if (!normalizedName) {
      setError("Webhook name is required.");
      return;
    }

    setBusy("create");
    setError(null);
    setInfo(null);
    try {
      const payload = await createProjectWebhook(backendToken, selectedProjectId, {
        name: normalizedName,
        autoDeployEnabled: true,
        createOnProvider,
      });
      setDetails(payload);
      setWebhookName(payload.name || normalizedName);
      setInfo(payload.webhookAutoCreated ? "Webhook created and synced to GitHub." : "Webhook created locally.");
      await loadProjects();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create webhook";
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRotateSecret() {
    if (!backendToken || !selectedProjectId) return;
    setBusy("rotate");
    setError(null);
    setInfo(null);
    try {
      const payload = await rotateProjectWebhook(backendToken, selectedProjectId);
      setDetails(payload);
      setInfo(payload.syncedProvider ? "Webhook secret rotated and synced." : "Webhook secret rotated locally.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to rotate webhook secret";
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteWebhook() {
    if (!backendToken || !selectedProjectId) return;
    const confirmed = window.confirm("Delete this webhook and disable auto deploy for this project?");
    if (!confirmed) return;

    setBusy("delete");
    setError(null);
    setInfo(null);
    try {
      await deleteProjectWebhook(backendToken, selectedProjectId);
      await loadWebhookDetails();
      await loadProjects();
      setInfo("Webhook deleted.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete webhook";
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Create, rotate, copy, and delete repository webhooks for auto-deploy.
          </p>
        </div>
        <button
          onClick={() => void loadProjects()}
          disabled={projectsLoading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-md text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${projectsLoading ? "animate-spin" : ""}`} />
          {projectsLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="bg-[#111] border border-white/10 rounded-xl shadow-2xl p-4">
        <label className="block text-xs text-gray-400 mb-2">Project</label>
        <select
          value={selectedProjectId}
          onChange={(event) => setSelectedProjectId(event.target.value)}
          className="w-full bg-black/30 border border-white/15 rounded-md px-3 py-2 text-sm text-white"
        >
          {projects.length === 0 ? <option value="">No projects found</option> : null}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.appName} ({project.repoFullName || project.repoUrl})
            </option>
          ))}
        </select>
      </div>

      {selectedProject ? (
        <div className="mt-6 bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <p className="text-sm text-gray-300">
              <span className="text-gray-500">Repo:</span>{" "}
              {selectedProject.repoFullName || selectedProject.repoUrl}
            </p>
            <p className="text-sm text-gray-300 mt-1">
              <span className="text-gray-500">Branch:</span> {selectedProject.branch}
            </p>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-2">Webhook Name</label>
              <input
                value={webhookName}
                onChange={(event) => setWebhookName(event.target.value)}
                placeholder="my-project-webhook"
                className="w-full bg-black/30 border border-white/15 rounded-md px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={createOnProvider}
                  onChange={(event) => setCreateOnProvider(event.target.checked)}
                />
                Sync to GitHub
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleCreateWebhook()}
                disabled={busy !== null}
                className="px-4 py-2 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {busy === "create"
                  ? "Saving..."
                  : details?.webhookConfigured
                    ? "Update Webhook"
                    : "Add Webhook"}
              </button>
              <button
                onClick={() => void handleRotateSecret()}
                disabled={busy !== null || !details?.webhookConfigured}
                className="px-4 py-2 rounded border border-blue-500/30 bg-blue-500/10 text-blue-300 text-sm hover:bg-blue-500/20 disabled:opacity-50"
              >
                {busy === "rotate" ? "Rotating..." : "Rotate Secret"}
              </button>
              <button
                onClick={() => void handleDeleteWebhook()}
                disabled={busy !== null || !details?.webhookConfigured}
                className="inline-flex items-center gap-2 px-4 py-2 rounded border border-red-500/30 bg-red-500/10 text-red-300 text-sm hover:bg-red-500/20 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {busy === "delete" ? "Deleting..." : "Delete Webhook"}
              </button>
            </div>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            {info ? <p className="text-sm text-emerald-300">{info}</p> : null}
            <p className="text-xs text-gray-500">
              Clicking <span className="text-gray-300">Add Webhook</span> enables auto deploy and generates webhook URL + secret.
            </p>

            {details ? (
              <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-4 space-y-3">
                <p className="text-xs text-gray-400">
                  Status:{" "}
                  <span className="text-gray-200">
                    {details.webhookConfigured ? "Configured" : "Not configured"}
                  </span>
                </p>
                <p className="text-xs text-gray-400">
                  Provider Hook ID:{" "}
                  <span className="text-gray-200">{details.webhookProviderId || "N/A"}</span>
                </p>

                <div>
                  <p className="text-xs text-gray-400 mb-1">Payload URL</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] text-emerald-300 break-all">{details.webhook.url}</code>
                    <button
                      onClick={() => void copyText(details.webhook.url, "url")}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/20 bg-white/5 text-gray-200 hover:bg-white/10"
                    >
                      <Copy className="h-3 w-3" />
                      {copiedField === "url" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-400 mb-1">Webhook Secret</p>
                  {details.webhook.secret ? (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[11px] text-emerald-300 break-all">{details.webhook.secret}</code>
                      <button
                        onClick={() => void copyText(details.webhook.secret || "", "secret")}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/20 bg-white/5 text-gray-200 hover:bg-white/10"
                      >
                        <Copy className="h-3 w-3" />
                        {copiedField === "secret" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Secret is not available. Create or rotate the webhook to generate a new secret.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-white/10 bg-[#111] p-8 text-center text-gray-400">
          Create a project first, then manage webhook from this tab.
        </div>
      )}
    </div>
  );
}
