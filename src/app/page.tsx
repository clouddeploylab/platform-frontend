"use client";

import { signIn, useSession } from "next-auth/react";
import { Github, Rocket, Server, Shield, Cloud } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-white"></div>
      </div>
    );
  }

  const features = [
    { icon: <Rocket className="h-6 w-6 text-indigo-400" />, title: "Automated CI/CD", desc: "Push to main and we handle the rest. Build, containerize, and deploy automatically." },
    { icon: <Server className="h-6 w-6 text-emerald-400" />, title: "Serverless & Edge", desc: "Global edge network ensures your application is fast for users everywhere." },
    { icon: <Shield className="h-6 w-6 text-purple-400" />, title: "Secure by Default", desc: "Enterprise-grade security, free SSL certificates, and DDoS protection built-in." }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a] text-white">
      {/* Navbar */}
      <header className="flex h-16 items-center justify-between border-b border-white/10 px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-indigo-500 to-purple-600">
            <Cloud className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold text-lg tracking-tight">CloudFlow</span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-gray-400">
          <a href="#" className="hover:text-white transition-colors">Documentation</a>
          <a href="#" className="hover:text-white transition-colors">Pricing</a>
          <a href="#" className="hover:text-white transition-colors">Blog</a>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center relative overflow-hidden px-4">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none"></div>
        
        <div className="z-10 flex flex-col items-center text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm mb-8 text-gray-300">
            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
            CloudFlow Platform v1.0 is Live
          </div>
          
          <h1 className="text-6xl sm:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-r from-white via-gray-200 to-gray-500 bg-clip-text text-transparent">
            Deploy your code <br className="hidden sm:block" /> with zero friction.
          </h1>
          
          <p className="text-xl text-gray-400 mb-10 max-w-2xl leading-relaxed">
            The easiest way to build, deploy, and scale your applications. Connect your GitHub repository and go live globally in seconds.
          </p>

          <button
            onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
            className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-md bg-white px-8 font-medium text-black transition-all hover:bg-gray-100 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-black"
          >
            <Github className="mr-2 h-5 w-5" />
            Continue with GitHub
            <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-12deg)_translateX(-100%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(100%)]">
              <div className="relative h-full w-8 bg-white/20" />
            </div>
          </button>
          <p className="mt-4 text-sm text-gray-500">Free forever for personal projects.</p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 max-w-5xl w-full z-10 px-4 pb-20">
          {features.map((feature, i) => (
            <div key={i} className="flex flex-col items-center text-center p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
              <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/10">
                {feature.icon}
              </div>
              <h3 className="text-lg font-medium text-gray-200 mb-2">{feature.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
