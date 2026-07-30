import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950" />
      <div className="relative mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
        <Link
          href="/"
          className="text-sm text-violet-300 transition hover:text-violet-200"
        >
          ← Back to claim
        </Link>
        <h1 className="mt-6 font-[family-name:var(--font-display)] text-3xl font-bold text-white">
          {title}
        </h1>
        {/* Element selectors instead of `prose`: the typography plugin is not installed. */}
        <article className="mt-8 space-y-4 text-sm leading-relaxed text-slate-300 [&_a]:text-violet-300 [&_a]:underline [&_h2]:mt-8 [&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
