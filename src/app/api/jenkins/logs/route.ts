import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

type SessionToken = {
  backendAccessToken?: string;
};

const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = (await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })) as SessionToken | null;

  const backendToken = token?.backendAccessToken;
  if (!backendToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const requestUrl = new URL(req.url);
  const job = requestUrl.searchParams.get("job");
  const build = requestUrl.searchParams.get("build");

  if (!job || !build) {
    return new Response("Missing required query params: job, build", { status: 400 });
  }

  const streamUrl = new URL("/api/v1/jenkins/logs/stream", backendUrl);
  streamUrl.searchParams.set("job", job);
  streamUrl.searchParams.set("build", build);

  const upstream = await fetch(streamUrl.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${backendToken}`,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    return new Response(text || "Failed to start log stream", { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
