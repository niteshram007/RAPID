import { NextRequest, NextResponse } from "next/server";

import { canAccessWorkspaceArea, getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

async function handleProxy(request: NextRequest, context: RouteContext) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessWorkspaceArea(session.role, "executive")) {
    return NextResponse.json(
      { detail: "Neural Switch is available only to executive accounts." },
      { status: 403 },
    );
  }

  const { path = [] } = await context.params;
  const normalizedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const search = request.nextUrl.search || "";
  const targetUrl = `${BACKEND_API_URL}/api/neural-switch/${normalizedPath}${search}`;

  const headers = buildBackendAuthHeaders(session, undefined, request);
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  if (accept) {
    headers.set("accept", accept);
  }

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const payload = await request.arrayBuffer();
    if (payload.byteLength > 0) {
      body = payload;
    }
  }

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-length");
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handleProxy(request, context);
}
