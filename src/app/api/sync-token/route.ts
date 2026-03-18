import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const githubAccessToken = (session as any).githubAccessToken;
  if (!githubAccessToken) return NextResponse.json({ error: "No GitHub access token in session" }, { status: 401 });

  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  const res = await fetch(`${backendUrl}/api/v1/auth/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: githubAccessToken }),
  });

  const body = await res.json();
  if (!res.ok) return NextResponse.json(body, { status: res.status });
  return NextResponse.json(body);
}
