import { Bot, ServerCog, SlidersHorizontal } from "lucide-react";

import { updatePlatformSettingsAction } from "@/app/admin/actions";
import { AdminSettingsNav } from "@/components/admin-settings-nav";
import { HolidayManager } from "@/components/holiday-manager";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import {
  getAdminSettings,
  getAdminWorkingDays,
  getBackendHealth,
} from "@/lib/backend-api";
import { getFinancialYears } from "@/lib/financial-years";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const pageMessages = {
  "settings-saved": {
    tone: "success",
    message: "Platform settings were saved successfully.",
  },
  "missing-settings-fields": {
    tone: "error",
    message: "Complete every settings field before saving.",
  },
  "invalid-settings": {
    tone: "error",
    message: "Review the settings values and try again.",
  },
  "settings-failed": {
    tone: "error",
    message: "The settings update could not be saved through FastAPI.",
  },
} as const;

function resolveQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [settingsResponse, health, workingDays] = await Promise.all([
    getAdminSettings(),
    getBackendHealth(),
    getAdminWorkingDays(),
  ]);
  const years = settingsResponse.financialYears.length
    ? settingsResponse.financialYears
    : getFinancialYears();
  const settings = settingsResponse.settings;
  const query = await searchParams;
  const feedbackKey =
    resolveQueryValue(query.status) ?? resolveQueryValue(query.error);
  const feedback = feedbackKey
    ? pageMessages[feedbackKey as keyof typeof pageMessages]
    : null;

  return (
    <>
      <WorkspacePageHeader
        eyebrow="Settings"
        title="Backend and Neural Switch settings"
        description="Manage the FastAPI-backed local LLM connection, its model, temperature, and the default financial year for workbook-driven analysis."
      />

      <AdminSettingsNav />

      {feedback ? (
        <div
          className={`rounded-[24px] border px-5 py-4 text-sm ${
            feedback.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <article className="surface-card px-6 py-6 lg:px-8">
          <span className="section-kicker">
            <Bot className="h-4 w-4" />
            Neural Switch
          </span>
          <h3 className="font-display mt-4 text-3xl tracking-tight text-slate-950">
            Local LLM connection
          </h3>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            These settings control the executive-only chat agent and the workbook
            narrative layer served by FastAPI.
          </p>

          <form action={updatePlatformSettingsAction} className="mt-8 grid gap-5">
            <label className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                name="localLlmEnabled"
                defaultChecked={settings.localLlmEnabled}
                className="h-4 w-4 rounded"
              />
              Enable Neural Switch local-LLM access
            </label>

            <label className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                name="showRestrictedRoleBudgets"
                defaultChecked={settings.showRestrictedRoleBudgets}
                className="h-4 w-4 rounded"
              />
              Show budget data for BDM and Practice Head workspaces
            </label>

            <div>
              <label
                className="block text-sm font-semibold text-slate-700"
                htmlFor="localLlmBaseUrl"
              >
                OpenAI-compatible base URL
              </label>
              <input
                id="localLlmBaseUrl"
                name="localLlmBaseUrl"
                defaultValue={settings.localLlmBaseUrl}
                className="auth-input"
              />
            </div>

            <div>
              <label
                className="block text-sm font-semibold text-slate-700"
                htmlFor="localLlmPlatformBaseUrl"
              >
                Platform base URL
              </label>
              <input
                id="localLlmPlatformBaseUrl"
                name="localLlmPlatformBaseUrl"
                defaultValue={settings.localLlmPlatformBaseUrl}
                className="auth-input"
              />
            </div>

            <div>
              <label
                className="block text-sm font-semibold text-slate-700"
                htmlFor="localLlmApiKey"
              >
                API key
              </label>
              <input
                id="localLlmApiKey"
                name="localLlmApiKey"
                type="password"
                defaultValue={settings.localLlmApiKey}
                className="auth-input"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-[1fr_0.34fr]">
              <div>
                <label
                  className="block text-sm font-semibold text-slate-700"
                  htmlFor="localLlmModel"
                >
                  Model
                </label>
                <input
                  id="localLlmModel"
                  name="localLlmModel"
                  defaultValue={settings.localLlmModel}
                  className="auth-input"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-semibold text-slate-700"
                  htmlFor="localLlmTemperature"
                >
                  Temperature
                </label>
                <input
                  id="localLlmTemperature"
                  name="localLlmTemperature"
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  defaultValue={settings.localLlmTemperature}
                  className="auth-input"
                />
              </div>
            </div>

            <div>
              <label
                className="block text-sm font-semibold text-slate-700"
                htmlFor="defaultFinancialYear"
              >
                Default financial year
              </label>
              <select
                id="defaultFinancialYear"
                name="defaultFinancialYear"
                defaultValue={settings.defaultFinancialYear}
                className="auth-input"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="auth-button-primary w-fit">
              Save settings
            </button>
          </form>
        </article>

        <div className="space-y-6">
          <article className="surface-card px-6 py-6 lg:px-8">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <ServerCog className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  FastAPI
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">
                  Service status: {health.status}
                </h3>
              </div>
            </div>
            <div className="mt-6 rounded-[24px] border border-slate-100 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
              Endpoint health is checked from the admin UI so you can quickly tell
              whether uploads and Neural Switch should be reachable.
            </div>
          </article>

          <article className="surface-card px-6 py-6 lg:px-8">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <SlidersHorizontal className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Current operating values
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">
                  Runtime snapshot
                </h3>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-5">
                <p className="text-sm text-slate-500">Model</p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  {settings.localLlmModel}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-5">
                <p className="text-sm text-slate-500">OpenAI-compatible base URL</p>
                <p className="mt-2 break-all text-base font-semibold text-slate-950">
                  {settings.localLlmBaseUrl}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-5">
                <p className="text-sm text-slate-500">Platform base URL</p>
                <p className="mt-2 break-all text-base font-semibold text-slate-950">
                  {settings.localLlmPlatformBaseUrl || "Not set"}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-5">
                <p className="text-sm text-slate-500">API key</p>
                <p className="mt-2 break-all text-base font-semibold text-slate-950">
                  {settings.localLlmApiKey
                    ? `${settings.localLlmApiKey.slice(0, 4)}••••${settings.localLlmApiKey.slice(-4)}`
                    : "Not set"}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-5">
                <p className="text-sm text-slate-500">Default year</p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  {settings.defaultFinancialYear}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-5">
                <p className="text-sm text-slate-500">Temperature</p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  {settings.localLlmTemperature}
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <HolidayManager
        months={workingDays.months}
        initialRows={workingDays.rows}
        editable
      />
    </>
  );
}
