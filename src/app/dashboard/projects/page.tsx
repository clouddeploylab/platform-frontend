"use client";

import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import { AppDispatch, RootState } from "@/store";
import { fetchProjectsStart, fetchProjectsSuccess, fetchProjectsFailure } from "@/store/projectSlice";
import { getUserProjects } from "@/lib/api";
import { ExternalLink, RefreshCw, Activity, CheckCircle2, XCircle, Clock } from "lucide-react";

export default function Projects() {
  const { data: session, status } = useSession();
  const dispatch = useDispatch<AppDispatch>();
  const { items: projects, loading, error } = useSelector((state: RootState) => state.projects);
  console.log("testing")

  useEffect(() => {
    if (status === "authenticated") {
      loadProjects();
      
      // Auto refresh every 10 seconds to update building status
      const interval = setInterval(loadProjects, 10000);
      return () => clearInterval(interval);
    }
  }, [status, session]);

  async function loadProjects() {
    if (!session || !(session as any).backendToken) return;
    const token = (session as any).backendToken as string;

    dispatch(fetchProjectsStart());
    try {
      const data = await getUserProjects(token);
      dispatch(fetchProjectsSuccess(data));
    } catch (err: any) {
      dispatch(fetchProjectsFailure(err.message));
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "BUILDING": return <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />;
      case "DEPLOYED": return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case "FAILED": return <XCircle className="h-4 w-4 text-red-400" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "BUILDING": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "DEPLOYED": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "FAILED": return "bg-red-500/10 text-red-400 border-red-500/20";
      default: return "bg-gray-500/10 text-gray-400 border-gray-500/20";
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
                  <th scope="col" className="px-6 py-4 font-medium text-center">Status</th>
                  <th scope="col" className="px-6 py-4 font-medium text-right">URL</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-medium text-white whitespace-nowrap">
                      {project.appName}
                    </td>
                    <td className="px-6 py-4 truncate max-w-[200px]" title={project.repoUrl}>
                      {project.repoUrl.replace("https://github.com/", "")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-xs font-mono">
                        {project.branch}
                      </span>
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
                      {project.status === "DEPLOYED" ? (
                        <a 
                          href={project.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
                        >
                          Visit <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
