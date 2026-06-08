import { LLMSettingsForm } from "@/components/neuralswitch/settings/LLMSettingsForm";

export default function SettingsPage() {
  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your local LLM endpoint, generation parameters, retrieval, and the system
          prompt. Changes apply immediately to new messages.
        </p>
        <div className="mt-6">
          <LLMSettingsForm />
        </div>
      </div>
    </div>
  );
}
