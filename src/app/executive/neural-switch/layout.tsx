import { ThemeProvider } from "@/components/neuralswitch/ui/theme-provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ExecutiveNeuralSwitchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-4 -my-4 h-[calc(100vh-72px)] overflow-hidden lg:-mx-7 lg:-my-6">
      <ThemeProvider>
        <main className="h-full w-full overflow-hidden">{children}</main>
      </ThemeProvider>
    </div>
  );
}
