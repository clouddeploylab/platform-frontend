"use client";
import { useEffect, useState } from "react";

type Repo = { fullName: string; cloneUrl: string; defaultBranch: string };

export default function Dashboard() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [deploying, setDeploying] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/backend/repos")  // Next.js route that proxies to Spring Boot
      .then(r => r.json())
      .then(setRepos);
  }, []);

  async function deploy(repo: Repo) {
    setDeploying(repo.fullName);
    const res = await fetch("/api/backend/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoUrl: repo.cloneUrl,
        branch: repo.defaultBranch,
        appName: repo.fullName.split("/")[1].toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      }),
    });
    const data = await res.json();
    setDeploying(null);
    alert(`Deploy triggered! URL: https://${data.appName}.yourplatform.com`);
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold mb-6">Your Repositories</h1>
      <ul className="space-y-3">
        {repos.map(repo => (
          <li key={repo.fullName}
              className="flex items-center justify-between p-4 border rounded-lg">
            <span className="font-mono text-sm">{repo.fullName}</span>
            <button
              onClick={() => deploy(repo)}
              disabled={deploying === repo.fullName}
              className="px-4 py-2 bg-black text-white rounded-md text-sm
                         disabled:opacity-50">
              {deploying === repo.fullName ? "Deploying…" : "Deploy"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}