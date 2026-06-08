"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, FileText, Settings, Bot } from "lucide-react";
import { cn } from "@/lib/neuralswitch/utils";
import { ThemeToggle } from "./theme-toggle";

const items = [
  { href: "/executive/neural-switch", label: "Chat", icon: MessageSquare },
  { href: "/executive/neural-switch/documents", label: "Documents", icon: FileText },
  { href: "/executive/neural-switch/settings", label: "Settings", icon: Settings },
];

export function NavRail() {
  const pathname = usePathname();
  return (
    <nav className="flex h-full w-16 flex-col items-center justify-between border-r border-border bg-card py-4">
      <div className="flex flex-col items-center gap-2">
        <Link
          href="/executive/neural-switch"
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          title="AI Chat Agent"
        >
          <Bot className="h-5 w-5" />
        </Link>
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </div>
      <ThemeToggle />
    </nav>
  );
}
