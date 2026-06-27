"use client";

import { usePathname } from "next/navigation";
import { Nav } from "@/components/nav";
import { LogoutButton } from "@/components/logout-button";
import { APP_VERSION } from "@/version";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The login page renders without the app chrome.
  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="md:flex md:min-h-screen">
      <aside className="hidden border-r border-gray-200 bg-white md:flex md:w-56 md:flex-col">
        <div className="px-5 py-4 text-lg font-semibold">💶 Finance</div>
        <Nav className="px-2" />
        <div className="mt-auto flex items-center justify-between gap-2 p-3">
          <LogoutButton />
          <span className="text-xs text-gray-400">v{APP_VERSION}</span>
        </div>
      </aside>
      <div className="flex-1">
        <header className="border-b border-gray-200 bg-white px-4 py-3 md:hidden">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-lg font-semibold">💶 Finance</div>
            <LogoutButton />
          </div>
          <Nav className="flex-row gap-1 overflow-x-auto" />
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
