import dynamic from "next/dynamic";

import { WorkspaceLoadingState } from "@/components/workspace-loading-state";
import type { BdmForecastSheetProps } from "@/components/bdm-forecast-sheet";
import type { BirdeyeAnalyticsKioskProps } from "@/components/birdeye-analytics-kiosk";
import type { MasterdataUploadViewerProps } from "@/components/masterdata-upload-viewer";
import type { MisTrendsKioskProps } from "@/components/mis-trends-kiosk";
import type { RevenueDashboardProps } from "@/components/revenue-dashboard";
import type { RevenuePivotWorkspaceProps } from "@/components/revenue-pivot-workspace";

export const LazyRevenueDashboard = dynamic<RevenueDashboardProps>(
  () => import("./revenue-dashboard.tsx").then((module) => module.RevenueDashboard),
  {
    loading: () => <WorkspaceLoadingState cards={4} rows={12} />,
  },
);

export const LazyExecutiveDynamicsPivot = dynamic(
  () => import("./executive-dynamics-pivot.tsx").then((module) => module.ExecutiveDynamicsPivot),
  {
    loading: () => <WorkspaceLoadingState compact cards={2} rows={6} />,
  },
);

export const LazyForecastSheet = dynamic<BdmForecastSheetProps>(
  () => import("./bdm-forecast-sheet.tsx").then((module) => module.BdmForecastSheet),
  {
    loading: () => <WorkspaceLoadingState cards={2} rows={14} />,
  },
);

export const LazyMasterdataUploadViewer = dynamic<MasterdataUploadViewerProps>(
  () => import("./masterdata-upload-viewer.tsx").then((module) => module.MasterdataUploadViewer),
  {
    loading: () => <WorkspaceLoadingState cards={3} rows={14} />,
  },
);

export const LazyRevenuePivotWorkspace = dynamic<RevenuePivotWorkspaceProps>(
  () => import("./revenue-pivot-workspace.tsx").then((module) => module.RevenuePivotWorkspace),
  {
    loading: () => <WorkspaceLoadingState cards={3} rows={10} />,
  },
);

export const LazyBudgetGlobalComparison = dynamic(
  () =>
    import("./budget-global-comparison.tsx").then(
      (module) => module.BudgetGlobalComparison,
    ),
  {
    loading: () => <WorkspaceLoadingState compact cards={2} rows={6} />,
  },
);

export const LazyBirdeyeAnalyticsKiosk = dynamic<BirdeyeAnalyticsKioskProps>(
  () => import("./birdeye-analytics-kiosk.tsx").then((module) => module.BirdeyeAnalyticsKiosk),
  {
    loading: () => <WorkspaceLoadingState cards={3} rows={10} />,
  },
);

export const LazyMisTrendsKiosk = dynamic<MisTrendsKioskProps>(
  () => import("./mis-trends-kiosk.tsx").then((module) => module.MisTrendsKiosk),
  {
    loading: () => <WorkspaceLoadingState cards={3} rows={10} />,
  },
);

export const LazyTrendsComparisonDashboard = dynamic(
  () =>
    import("./trends-comparison-dashboard.tsx").then(
      (module) => module.TrendsComparisonDashboard,
    ),
  {
    loading: () => <WorkspaceLoadingState cards={3} rows={10} />,
  },
);
