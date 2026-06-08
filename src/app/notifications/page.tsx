import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { NotificationsInbox } from "@/components/notifications-inbox";
import { getDefaultRouteForRole, getSessionProfile } from "@/lib/auth";
import { getRapidRevenueNotifications } from "@/lib/rapid-revenue-server";

export default async function NotificationsPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login");
  }

  if (session.role?.id === "bdm" || session.role?.id === "practice-head") {
    redirect(getDefaultRouteForRole(session.role));
  }

  const payload = await getRapidRevenueNotifications(session);
  const homeHref = getDefaultRouteForRole(session.role);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-4">
        <Link
          href={homeHref}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Go back to home
        </Link>
      </div>
      <NotificationsInbox
        notifications={payload.notifications}
        forecastSubmissionMatrix={
          payload.forecastSubmissionMatrix ?? { columns: { bdm: [], practiceHead: [] }, rows: [] }
        }
      />
    </div>
  );
}
