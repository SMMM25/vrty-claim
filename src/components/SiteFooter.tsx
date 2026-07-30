import Link from "next/link";
import {
  GITHUB_REPO,
  PRIVACY_PATH,
  SUPPORT_EMAIL,
  SUPPORT_PATH,
  TERMS_PATH,
} from "@/lib/site-links";

export function SiteFooter() {
  return (
    <footer className="mt-10 space-y-2 text-center text-xs text-slate-500">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link href={TERMS_PATH} className="transition hover:text-violet-300">
          Terms of Service
        </Link>
        <Link href={PRIVACY_PATH} className="transition hover:text-violet-300">
          Privacy Policy
        </Link>
        <Link href={SUPPORT_PATH} className="transition hover:text-violet-300">
          Support
        </Link>
        <a
          href={GITHUB_REPO}
          className="transition hover:text-violet-300"
          target="_blank"
          rel="noreferrer"
        >
          Open source
        </a>
      </nav>
      <p>
        Built by Verity Protocol ·{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="transition hover:text-violet-300"
        >
          {SUPPORT_EMAIL}
        </a>
      </p>
      <p>Not affiliated with Ripple, XRPL Labs, or Xaman.</p>
    </footer>
  );
}
