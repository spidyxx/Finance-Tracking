"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/entries", label: "Entries" },
  { href: "/accounts", label: "Accounts" },
  { href: "/categories", label: "Categories" },
  { href: "/recurring", label: "Recurring" },
];

export function Nav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {links.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap",
              active
                ? "bg-gray-900 text-white"
                : "text-gray-700 hover:bg-gray-100",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
