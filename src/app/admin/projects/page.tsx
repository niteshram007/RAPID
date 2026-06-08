import Link from "next/link";

import { ProjectAssignmentWorkbench } from "@/components/project-assignment-workbench";
import { requirePermission } from "@/lib/auth";
import { getProjectAssignmentWorkbench } from "@/lib/rapid-revenue-server";

export default async function AdminProjectsPage() {
  const session = await requirePermission("manage_users");
  const payload = await getProjectAssignmentWorkbench(session);
  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5">
        <Link
          href="/admin/projects"
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
        >
          Project Mapping
        </Link>
        <Link
          href="/admin/projects/allocation-board"
          className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Allocation Board
        </Link>
      </div>
      <ProjectAssignmentWorkbench initial={payload} mode="projects" />
    </div>
  );
}
