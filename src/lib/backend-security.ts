import { createHmac } from "crypto";

import type { NextRequest } from "next/server";

import { getRevenueAccessScope, type SessionProfile } from "@/lib/auth";

const DEFAULT_SHARED_SECRET = "rapid-local-dev-shared-secret-change-me";
const AUTH_PAYLOAD_HEADER = "x-rapid-auth-payload";
const AUTH_SIGNATURE_HEADER = "x-rapid-auth-signature";
const SERVICE_PAYLOAD_HEADER = "x-rapid-service-payload";
const SERVICE_SIGNATURE_HEADER = "x-rapid-service-signature";

function getSharedSecret() {
  return (
    process.env.RAPID_BACKEND_SHARED_SECRET?.trim() ||
    process.env.RAPID_SESSION_SECRET?.trim() ||
    DEFAULT_SHARED_SECRET
  );
}

function encodeBase64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signPayload(payload: string) {
  return createHmac("sha256", getSharedSecret()).update(payload).digest("hex");
}

function appendForwardingHeaders(headers: Headers, request?: NextRequest | Request | null) {
  if (!request) {
    return headers;
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");
  if (forwardedFor) {
    headers.set("x-forwarded-for", forwardedFor);
  } else if (realIp) {
    headers.set("x-real-ip", realIp);
  }
  if (userAgent) {
    headers.set("user-agent", userAgent);
  }
  return headers;
}

export function buildBackendAuthHeaders(
  session: SessionProfile,
  initHeaders?: HeadersInit,
  request?: NextRequest | Request | null,
) {
  const headers = new Headers(initHeaders);
  const scope = getRevenueAccessScope(session);
  const payload = encodeBase64Url({
    userId: session.userId,
    email: session.email,
    name: session.name,
    roleId: session.role?.id ?? session.roleId,
    roleName: session.role?.name ?? session.title,
    permissions: session.role?.permissions ?? [],
    scope: {
      financialYears: scope.financialYears,
      practiceHeads: scope.practiceHeads,
      geoHeads: scope.geoHeads,
      bdms: scope.bdms,
      entities: scope.entities,
      verticals: scope.verticals,
    },
    issuedAt: Date.now(),
  });
  headers.set(AUTH_PAYLOAD_HEADER, payload);
  headers.set(AUTH_SIGNATURE_HEADER, signPayload(payload));
  return appendForwardingHeaders(headers, request);
}

export function buildServiceSignatureHeaders(initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders);
  const payload = encodeBase64Url({
    service: "rapid-next",
    issuedAt: Date.now(),
  });
  headers.set(SERVICE_PAYLOAD_HEADER, payload);
  headers.set(SERVICE_SIGNATURE_HEADER, signPayload(payload));
  return headers;
}
