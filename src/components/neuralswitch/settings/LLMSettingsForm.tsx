"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Plug, Save, XCircle } from "lucide-react";
import { api } from "@/lib/neuralswitch/api";
import type { AppSettings, TestConnectionResult } from "@/lib/neuralswitch/types";
import { Button } from "@/components/neuralswitch/ui/button";
import { Input } from "@/components/neuralswitch/ui/input";
import { Label } from "@/components/neuralswitch/ui/label";
import { Textarea } from "@/components/neuralswitch/ui/textarea";
import { Switch } from "@/components/neuralswitch/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/neuralswitch/ui/card";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function LLMSettingsForm() {
  const [settings, setSettings] = React.useState<AppSettings>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<TestConnectionResult | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setSettings(await api.getSettings());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testConnection({
        llm_base_url: settings.llm_base_url,
        llm_api_key: settings.llm_api_key,
      });
      setTestResult(result);
      if (result.ok && result.models.length && !result.models.includes(settings.llm_model || "")) {
        // keep current model; just surface the available list
      }
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message, models: [] });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Local LLM connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider name">
              <Input
                value={settings.provider_name || ""}
                onChange={(e) => set("provider_name", e.target.value)}
                placeholder="LM Studio / Ollama / vLLM"
              />
            </Field>
            <Field label="Base URL" hint="OpenAI-compatible endpoint, ending in /v1">
              <Input
                value={settings.llm_base_url || ""}
                onChange={(e) => set("llm_base_url", e.target.value)}
                placeholder="http://localhost:1234/v1"
              />
            </Field>
            <Field label="API key" hint="Use any value if your server doesn't require one">
              <Input
                type="password"
                value={settings.llm_api_key || ""}
                onChange={(e) => set("llm_api_key", e.target.value)}
                placeholder="local-key"
              />
            </Field>
            <Field label="Model name">
              <Input
                value={settings.llm_model || ""}
                onChange={(e) => set("llm_model", e.target.value)}
                placeholder="qwen2.5:7b-instruct"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={test} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Test connection
            </Button>
            {testResult && (
              <span
                className={`flex items-center gap-1.5 text-sm ${
                  testResult.ok ? "text-green-600" : "text-red-600"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {testResult.message}
              </span>
            )}
          </div>

          {testResult?.ok && testResult.models.length > 0 && (
            <div>
              <Label>Available models</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {testResult.models.map((m) => (
                  <button
                    key={m}
                    onClick={() => set("llm_model", m)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generation parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={`Temperature (${settings.temperature ?? 0.3})`}>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={settings.temperature ?? 0.3}
                onChange={(e) => set("temperature", parseFloat(e.target.value))}
                className="w-full"
              />
            </Field>
            <Field label={`Top-p (${settings.top_p ?? 1})`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.top_p ?? 1}
                onChange={(e) => set("top_p", parseFloat(e.target.value))}
                className="w-full"
              />
            </Field>
            <Field label="Max tokens">
              <Input
                type="number"
                value={settings.max_tokens ?? 2048}
                onChange={(e) => set("max_tokens", parseInt(e.target.value || "0", 10))}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Streaming responses</p>
              <p className="text-xs text-muted-foreground">Stream tokens as they generate.</p>
            </div>
            <Switch
              checked={settings.streaming ?? true}
              onCheckedChange={(v) => set("streaming", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retrieval (RAG)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">RAG enabled</p>
              <p className="text-xs text-muted-foreground">
                Allow answering from uploaded documents.
              </p>
            </div>
            <Switch
              checked={settings.rag_enabled ?? true}
              onCheckedChange={(v) => set("rag_enabled", v)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Top-K retrieved chunks">
              <Input
                type="number"
                value={settings.rag_top_k ?? 5}
                onChange={(e) => set("rag_top_k", parseInt(e.target.value || "0", 10))}
              />
            </Field>
            <Field label={`Score threshold (${settings.rag_score_threshold ?? 0.35})`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.rag_score_threshold ?? 0.35}
                onChange={(e) => set("rag_score_threshold", parseFloat(e.target.value))}
                className="w-full"
              />
            </Field>
            <Field label="Embedding model">
              <Input
                value={settings.embedding_model || ""}
                onChange={(e) => set("embedding_model", e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={8}
            value={settings.system_prompt || ""}
            onChange={(e) => set("system_prompt", e.target.value)}
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 pb-10">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save settings
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
