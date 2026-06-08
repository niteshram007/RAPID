import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { LazyMasterdataUploadViewer } from "@/components/workspace-lazy-components";
import { requirePermission } from "@/lib/auth";
import { getAdminUploads } from "@/lib/backend-api";
import { getFinancialYears } from "@/lib/financial-years";

export default async function GeoHeadMasterDataPage() {
  await requirePermission("view_dashboard");
  const uploads = await getAdminUploads();
  const financialYears = uploads.financialYears.length
    ? uploads.financialYears
    : getFinancialYears();
  const datasetFinancialYears = uploads.uploads.reduce<
    Record<"budget" | "global_revenue" | "forecast", string[]>
  >(
    (accumulator, upload) => {
      const datasetType = upload.datasetType;
      if (
        (datasetType === "budget" ||
          datasetType === "global_revenue" ||
          datasetType === "forecast") &&
        upload.financialYear
      ) {
        const current = accumulator[datasetType];
        if (!current.includes(upload.financialYear)) {
          current.push(upload.financialYear);
        }
      }
      return accumulator;
    },
    {
      budget: [],
      global_revenue: [],
      forecast: [],
    },
  );
  const defaultYear =
    datasetFinancialYears.global_revenue.at(-1) ??
    datasetFinancialYears.budget.at(-1) ??
    financialYears.at(-1) ??
    "2026-2027";

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        eyebrow="Geo Head"
        title="Master Data"
        description="Read-only uploaded master data for your geography, without exposing data outside your scope."
      />
      <LazyMasterdataUploadViewer
        financialYears={financialYears}
        datasetFinancialYears={datasetFinancialYears}
        initialFinancialYear={defaultYear}
      />
    </div>
  );
}
