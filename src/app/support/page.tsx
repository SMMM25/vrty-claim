import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import {
  GITHUB_ISSUES,
  MAIN_SITE,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
  SUPPORT_URL,
} from "@/lib/site-links";

export const metadata: Metadata = {
  title: "Support | VRTY Claim",
  description: "Get help with the VRTY Claim portal.",
  alternates: { canonical: SUPPORT_URL },
};

export default function SupportPage() {
  return (
    <LegalPage title="Support">
      <p>
        Need help with a claim, eligibility, or a failed transaction? Contact{" "}
        {PRODUCT_NAME} using the channels below.
      </p>

      <h2>Email</h2>
      <p>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>

      <h2>GitHub issues</h2>
      <p>
        For bugs or technical questions about the open-source claim portal, open
        an issue on{" "}
        <a href={GITHUB_ISSUES} target="_blank" rel="noreferrer">
          GitHub
        </a>
        . Please do not post wallet secrets or secret numbers.
      </p>

      <h2>More about Verity Protocol</h2>
      <p>
        <a href={MAIN_SITE}>{MAIN_SITE}</a>
      </p>

      <h2>Common topics</h2>
      <ul>
        <li>
          <strong>Not eligible?</strong> Your wallet must hold at least 10 XRP
          continuously for 7 days. Dropping below 10 XRP resets the timer.
        </li>
        <li>
          <strong>Trust line</strong> — you must sign a VRTY TrustSet in your
          wallet before receiving tokens (standard XRPL reserve applies).
        </li>
        <li>
          <strong>Already claimed</strong> — each wallet and each IP address may
          claim once only.
        </li>
        <li>
          <strong>Xaman sign-in</strong> — approve the sign request on your phone
          when connecting.
        </li>
      </ul>

      <p>
        We are not affiliated with XRPL Labs or Xaman wallet support. For
        wallet-specific issues, contact Xaman support directly.
      </p>
    </LegalPage>
  );
}
