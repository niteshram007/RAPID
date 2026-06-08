import { NextRequest, NextResponse } from "next/server";

import { canAccessRevenueWorkspace, getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_PROMPT_CHARS = 12_000;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function getLlmConfig() {
  const baseUrl =
    process.env.RAPID_ANALYTICS_LLM_BASE_URL?.trim() ||
    process.env.LLM_BASE_URL?.trim() ||
    "";
  const apiKey =
    process.env.RAPID_ANALYTICS_LLM_API_KEY?.trim() ||
    process.env.LLM_API_KEY?.trim() ||
    "";
  const model =
    process.env.RAPID_ANALYTICS_LLM_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    process.env.DEFAULT_MODEL?.trim() ||
    "";
  return { baseUrl, apiKey, model };
}

function toChatCompletionsEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

function trimPrompt(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > MAX_PROMPT_CHARS ? text.slice(0, MAX_PROMPT_CHARS) : text;
}

function fallbackInsight(prompt: string, tableTitle: string) {
  const totalsMatch = prompt.match(/Totals:\s*(\{.*\})/);
  const totals = totalsMatch?.[1] ?? "{}";
  return [
    "Summary:",
    `${tableTitle || "This table"} is ready for review, but the LLM insight service is not configured or did not respond.`,
    "",
    "Key Observations:",
    `The current table totals are ${totals}. Use the table rows for exact budget, forecast, and YTD Revenue$ values.`,
    "",
    "Risk Flags:",
    "Automated narrative generation was unavailable for this request.",
    "",
    "Recommended Actions:",
    "Review the highest variance rows and open drilldown for the records behind the numbers.",
  ].join("\n");
}

async function callLlm(prompt: string) {
  const { baseUrl, apiKey, model } = getLlmConfig();
  if (!baseUrl || !apiKey || !model) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(toChatCompletionsEndpoint(baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are RAPID analytics copilot. Explain uploaded workbook numbers in concise business language.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 700,
        stream: false,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as ChatCompletionResponse;
    return String(body.choices?.[0]?.message?.content ?? "").trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_dashboard") || !canAccessRevenueWorkspace(session.role)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { prompt?: unknown; tableTitle?: unknown }
    | null;
  const prompt = trimPrompt(body?.prompt);
  const tableTitle = String(body?.tableTitle ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ detail: "Prompt is required." }, { status: 400 });
  }

  const content = (await callLlm(prompt)) ?? fallbackInsight(prompt, tableTitle);
  return NextResponse.json({
    content,
    generatedAt: new Date().toISOString(),
  });
}
