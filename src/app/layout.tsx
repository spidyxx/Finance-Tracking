import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Finance Tracker",
  description: "Self-hosted personal finance tracker",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="md:flex md:min-h-screen">
            <aside className="hidden border-r border-gray-200 bg-white md:flex md:w-56 md:flex-col">
              <div className="px-5 py-4 text-lg font-semibold">💶 Finance</div>
              <Nav className="px-2" />
            </aside>
            <div className="flex-1">
              <header className="border-b border-gray-200 bg-white px-4 py-3 md:hidden">
                <div className="mb-2 text-lg font-semibold">💶 Finance</div>
                <Nav className="flex-row gap-1 overflow-x-auto" />
              </header>
              <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
