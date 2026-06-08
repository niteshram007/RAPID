import Link from "next/link";
import { Database, TrendingUp, Wallet } from "lucide-react";

import { WorkspacePageHeader } from "@/components/workspace-page-header";

const DATASET_SECTIONS = [
  {
    href: "/admin/upload/budget",
    title: "Budget",
    description: "Upload and read budget workbooks in a dedicated page.",
    icon: Wallet,
  },
  {
    href: "/admin/upload/actuals",
    title: "Actuals",
    description: "Upload the monthly actuals workbook from this dedicated page.",
    icon: TrendingUp,
  },
  {
    href: "/admin/master-data",
    title: "Masterdata",
    description: "Review and edit uploaded budget and actuals rows in one place.",
    icon: Database,
  },
] as const;

export default function AdminUploadPage() {
  return (
    <>
      <WorkspacePageHeader
        eyebrow="Upload"
        title="Dataset upload workspace"
        description="Use the dedicated pages below to upload and review files by dataset."
      />

      <section className="grid gap-4 md:grid-cols-3">
        {DATASET_SECTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="surface-card flex flex-col gap-3 px-6 py-6 transition hover:border-slate-300"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="text-xl font-semibold text-slate-950">{item.title}</h3>
              <p className="text-sm text-slate-600">{item.description}</p>
            </Link>
          );
        })}
      </section>
    </>
  );
}
