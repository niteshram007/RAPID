import { AdminUploadDatasetPage } from "@/components/admin-upload-dataset-page";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminUploadBudgetPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <AdminUploadDatasetPage pageKey="budget" searchParams={await searchParams} />;
}
