import { ChevronRight, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { getDefaultRouteForRole, getSessionProfile } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const feedbackByError = {
  "invalid-role": "Choose one of the roles assigned to your account.",
} as const;

function readQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SelectRolePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login");
  }

  if (session.availableRoles.length <= 1) {
    redirect(getDefaultRouteForRole(session.role));
  }

  const query = await searchParams;
  const errorKey = readQueryValue(query.error);
  const feedback = errorKey
    ? feedbackByError[errorKey as keyof typeof feedbackByError]
    : null;

  return (
    <AuthShell
      eyebrow="Role access"
      title="Choose your workspace"
      description="This account can open more than one RAPID workspace. Select the role you want to use for this session."
      panel={
        <article className="auth-panel-card px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">Session role</p>
              <p className="text-sm text-slate-600">
                Your credentials stay the same. Only the visible workspace and scoped data change.
              </p>
            </div>
          </div>
        </article>
      }
    >
      {feedback ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
          {feedback}
        </div>
      ) : null}

      <div className="grid gap-3">
        {session.availableRoles.map((role) => (
          <form key={role.id} action="/api/auth/select-role" method="post">
            <input type="hidden" name="roleId" value={role.id} />
            <button
              type="submit"
              className="flex w-full items-center justify-between rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                  {role.name}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{role.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
            </button>
          </form>
        ))}
      </div>
    </AuthShell>
  );
}
