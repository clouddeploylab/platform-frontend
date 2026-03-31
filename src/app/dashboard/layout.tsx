"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Cloud, Loader2, LogOut, LayoutDashboard, LayoutTemplate, Webhook } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMyWorkspace, getUserProjects, ProjectResult, WorkspaceDetailsResult } from "@/lib/api";

type SessionWithBackendToken = {
  backendToken?: string | null;
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState<WorkspaceDetailsResult | null>(null);
  const [projects, setProjects] = useState<ProjectResult[]>([]);
  const [loadingSidebar, setLoadingSidebar] = useState(false);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const backendToken = (session as SessionWithBackendToken | null)?.backendToken ?? null;

  useEffect(() => {
    if (!backendToken) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoadingSidebar(true);
      setSidebarError(null);
    });

    Promise.all([getMyWorkspace(backendToken), getUserProjects(backendToken)])
      .then(([workspacePayload, projectsPayload]) => {
        if (cancelled) return;
        setWorkspace(workspacePayload);
        setProjects(projectsPayload);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load workspace";
        setSidebarError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSidebar(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backendToken, pathname]);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => a.appName.localeCompare(b.appName));
  }, [projects]);

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-white font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 bg-[#0a0a0a] flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-gradient-to-br from-indigo-500 to-purple-600">
              <Cloud className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold tracking-tight">CloudFlow</span>
          </div>
        </div>

        <div className="px-4 pt-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Workspace</p>
            <p className="text-sm font-medium truncate">{workspace?.name || "My Workspace"}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {workspace?.projectCount ?? projects.length} projects
            </p>
          </div>
        </div>

        <div className="px-4 pt-6 space-y-1">
          <Link
            href="/dashboard"
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname === "/dashboard" 
                ? "bg-white/10 text-white font-medium" 
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Overview
          </Link>
          <Link
            href="/dashboard/projects"
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname.startsWith("/dashboard/projects")
                ? "bg-white/10 text-white font-medium" 
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <LayoutTemplate className="h-4 w-4" />
            Deployments
          </Link>
          <Link
            href="/dashboard/webhooks"
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname.startsWith("/dashboard/webhooks")
                ? "bg-white/10 text-white font-medium"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Webhook className="h-4 w-4" />
            Webhooks
          </Link>
        </div>

        <div className="mt-4 px-4">
          <p className="px-3 text-[11px] uppercase tracking-wide text-gray-500 mb-2">Projects</p>
          <div className="space-y-1 max-h-48 overflow-auto pr-1">
            {loadingSidebar ? (
              <div className="px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading...
              </div>
            ) : null}
            {!loadingSidebar && sidebarError ? (
              <div className="px-3 py-2 text-xs text-red-400 truncate" title={sidebarError}>
                Failed to load projects
              </div>
            ) : null}
            {!loadingSidebar && !sidebarError && sortedProjects.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-500">No projects yet</p>
            ) : null}
            {!loadingSidebar && !sidebarError
              ? sortedProjects.map((project) => {
                  const href = `/dashboard/projects/${project.id}`;
                  const active = pathname.startsWith(href);
                  return (
                    <Link
                      key={project.id}
                      href={href}
                      className={`block truncate px-3 py-2 rounded-md text-sm transition-colors ${
                        active
                          ? "bg-white/10 text-white font-medium"
                          : "text-gray-400 hover:text-white hover:bg-white/5"
                      }`}
                      title={project.appName}
                    >
                      {project.appName}
                    </Link>
                  );
                })
              : null}
          </div>
        </div>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <img 
              src={session?.user?.image || "https://github.com/ghost.png"} 
              alt="Avatar" 
              className="h-8 w-8 rounded-full border border-white/10" 
            />
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{session?.user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
            </div>
          </div>
          <button 
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
