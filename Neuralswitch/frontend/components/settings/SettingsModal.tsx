"use client";

import * as React from "react";
import { Loader2, RefreshCw, Save, X } from "lucide-react";
import { api } from "@/lib/api";
import type { AppSettings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ModelSettings } from "./ModelSettings";
import { RagSettings } from "./RagSettings";
import { RealtimeToolSettings } from "./RealtimeToolSettings";
import { AppearanceSettings } from "./AppearanceSettings";

const TABS = ["General", "Models", "RAG", "Real-time tools", "Appearance", "About"] as const;
type Tab = (typeof TABS)[number];

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState<Tab>("General");
  const [settings, setSettings] = React.useState<AppSettings>({});
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await api.getSettings());
      setMessage(null);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  const save = async () => {
    setSaving(true);
    try {
      setSettings(await api.updateSettings(settings));
      setMessage("Settings saved.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await api.testConnection({
        llm_base_url: settings.llm_base_url,
        llm_api_key: settings.llm_api_key,
      });
      setMessage(res.ok ? `Connected. Models: ${res.models.join(", ")}` : res.message);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[85vh] w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-background shadow-xl">
        <aside className="w-52 border-r border-border p-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm ${
                t === tab ? "bg-accent font-medium" : "hover:bg-accent/60"
              }`}
            >
              {t}
            </button>
          ))}
        </aside>
        <section className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Settings · {tab}</h2>
            <button onClick={onClose} className="rounded p-1 hover:bg-accent">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="thin-scroll flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : (
              <>
                {tab === "General" && (
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>Configure model, RAG, tools, and appearance from the tabs.</p>
                    <p>These settings are persisted in backend `settings` and apply to new requests.</p>
                  </div>
                )}
                {tab === "Models" && <ModelSettings settings={settings} set={set} />}
                {tab === "RAG" && <RagSettings settings={settings} set={set} />}
                {tab === "Real-time tools" && <RealtimeToolSettings settings={settings} set={set} />}
                {tab === "Appearance" && <AppearanceSettings />}
                {tab === "About" && (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>Local AI Chat Agent, ChatGPT-like UI, modular for RAPID integration.</p>
                    <p>All LLM calls are routed through FastAPI backend.</p>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-border px-4 py-3">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test connection"}
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
            {message && <span className="ml-2 text-xs text-muted-foreground">{message}</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
