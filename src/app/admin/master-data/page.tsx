import { LazyMasterdataUploadViewer } from "@/components/workspace-lazy-components";
import { MasterdataMappingWorkspace } from "@/components/masterdata-mapping-workspace";
import { MasterdataReconciliationMonitor } from "@/components/masterdata-reconciliation-monitor";
import { getAdminUploads } from "@/lib/backend-api";
import { getFinancialYears } from "@/lib/financial-years";

type DatasetType = "budget" | "global_revenue" | "forecast";

export default async function AdminMasterDataPage() {
  const uploads = await getAdminUploads();
  const financialYears = uploads.financialYears.length > 0 ? uploads.financialYears : getFinancialYears();
  const datasetFinancialYears = uploads.uploads.reduce<Partial<Record<DatasetType, string[]>>>(
    (accumulator, upload) => {
      const datasetType = String(upload.datasetType || "").trim().toLowerCase() as DatasetType;
      if (!["budget", "global_revenue", "forecast"].includes(datasetType)) {
        return accumulator;
      }
      const year = String(upload.financialYear || "").trim();
      if (!year) {
        return accumulator;
      }
      const current = accumulator[datasetType] ?? [];
      if (!current.includes(year)) {
        accumulator[datasetType] = [...current, year];
      }
      return accumulator;
    },
    {},
  );

  return (
    <div className="space-y-6">
      <LazyMasterdataUploadViewer
        financialYears={financialYears}
        datasetFinancialYears={datasetFinancialYears}
        initialFinancialYear={financialYears.at(-1) ?? "2026-2027"}
      />
      <MasterdataMappingWorkspace
        financialYears={financialYears}
        initialFinancialYear={financialYears.at(-1) ?? "2026-2027"}
      />
      <MasterdataReconciliationMonitor
        financialYears={financialYears}
        initialFinancialYear={financialYears.at(-1) ?? "2026-2027"}
      />
    </div>
  );
}
