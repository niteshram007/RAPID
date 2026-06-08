import type { Metadata } from "next";
import "./globals.css";
import "highlight.js/styles/github.css";
import { ThemeProvider } from "@/components/ui/theme-provider";

export const metadata: Metadata = {
  title: "AI Chat Agent",
  description: "Local LLM chat assistant with RAG, designed to merge into RAPID.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <main className="h-screen w-screen overflow-hidden">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
