import type { Metadata } from "next";

import { PwaRegister } from "@/components/pwa-register";
import { QueryProvider } from "@/components/providers/query-provider";
import { APP_NAME } from "@/lib/branding";
import "./globals.css";
import "highlight.js/styles/github.css";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: APP_NAME,
  description:
    "RAPID provides a controlled environment to review revenue performance, compare business metrics, and access the right workspace with the right level of authority.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
