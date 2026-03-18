"use client";

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import { AppDispatch, RootState } from "@/store";
import { fetchReposStart, fetchReposSuccess, fetchReposFailure } from "@/store/repoSlice";
import { getUserRepos, deployProject } from "@/lib/api";
import { Github, Search, Plus, CloudCog } from "lucide-react";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const dispatch = useDispatch<AppDispatch>();
  const { items: repos, loading, error } = useSelector((state: RootState) => state.repos);
  const [search, setSearch] = useState("");
  const [deployingRepo, setDeployingRepo] = useState<string | null>(null);
  console.log(repos)
  console.log("This is testing for list repository from github")

  useEffect(() => {
    if (status === "authenticated" && repos.length === 0 && !loading) {
      loadRepos();
    }
  }, [status]);

  async function loadRepos() {
    if (!session || !(session as any).backendToken) return;
    const token = (session as any).backendToken as string;

    dispatch(fetchReposStart());
    try {
      const data = await getUserRepos(token);
      dispatch(fetchReposSuccess(data));
    } catch (err: any) {
      dispatch(fetchReposFailure(err.message));
    }
  }

  async function handleDeploy(repoUrl: string, branch: string, repoFullName: string) {
    if (!session || !(session as any).backendToken) return;
    const token = (session as any).backendToken as string;

    try {
      setDeployingRepo(repoFullName);
      // Generate safe app name from repo name (e.g. org/repo-name -> repo-name-org)
      const cleanName = repoFullName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().substring(0, 30);
      const randomSuffix = Math.floor(Math.random() * 10000);
      const appName = `${cleanName}-${randomSuffix}`;
      
      await deployProject(token, branch, repoUrl, appName, 3000);
      alert("Deployment triggered successfully! Check the Deployments tab.");
    } catch (error: any) {
      alert("Failed to deploy: " + error.message);
    } finally {
      setDeployingRepo(null);
    }
  }

  const filteredRepos = repos.filter(r => r.fullName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Let's build something new.</h1>
          <p className="text-gray-400 mt-1 text-sm">Select a repository from your GitHub account to deploy.</p>
        </div>
        <button 
          onClick={loadRepos}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-md text-sm hover:bg-white/10 transition-colors"
        >
          {loading ? "Refreshing..." : "Refresh list"}
        </button>
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
    </div>
  );
}