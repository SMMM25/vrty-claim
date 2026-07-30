import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import {
  CLAIM_AMOUNT,
  CLAIM_CAP,
  BALANCE_HOLD_DAYS,
  MIN_XRP,
} from "@/lib/config";
import {
  COMPANY_ADDRESS,
  COMPANY_NAME,
  MAIN_SITE,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
  TERMS_URL,
} from "@/lib/site-links";

export const metadata: Metadata = {
  title: "Terms of Service | VRTY Claim",
  description: "Terms of Service for the VRTY Claim portal.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        Last updated: July 30, 2026. These Terms of Service (&quot;Terms&quot;)
        govern your use of the VRTY Claim portal (the &quot;Service&quot;)
        operated by {COMPANY_NAME} doing business as {PRODUCT_NAME} (&quot;we,&quot;
        &quot;us&quot;).
      </p>

      <h2>1. The Service</h2>
      <p>
        The Service allows eligible self-custody XRPL wallets to claim{" "}
        {CLAIM_AMOUNT} VRTY tokens subject to published eligibility rules,
        including holding at least {MIN_XRP} XRP continuously for{" "}
        {BALANCE_HOLD_DAYS} days and a global cap of {CLAIM_CAP.toLocaleString()}{" "}
        successful claims. We may update eligibility criteria or suspend the
        Service at any time to protect users or comply with law.
      </p>

      <h2>2. No investment advice</h2>
      <p>
        VRTY is a utility token for the {PRODUCT_NAME} platform described at{" "}
        <a href={MAIN_SITE}>{MAIN_SITE}</a>. Nothing on this site constitutes
        financial, legal, or tax advice. You are solely responsible for your
        wallet and transaction decisions.
      </p>

      <h2>3. Self-custody wallets</h2>
      <p>
        You must control the private keys for any wallet you connect. We never
        ask for your secret keys or secret numbers. You pay XRPL network reserves
        and fees for trust lines and transactions you sign.
      </p>

      <h2>4. One claim per wallet and IP</h2>
      <p>
        Each wallet and each IP address may receive at most one successful claim.
        We use automated checks to prevent abuse. Attempts to circumvent limits
        may result in rejection.
      </p>

      <h2>5. No affiliation</h2>
      <p>
        {PRODUCT_NAME} is not affiliated with Ripple, XRPL Labs, or Xaman. Xaman
        and the XRP Ledger are third-party services we integrate with.
      </p>

      <h2>6. Disclaimer</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND.
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE ARE NOT LIABLE FOR INDIRECT,
        INCIDENTAL, OR CONSEQUENTIAL DAMAGES ARISING FROM USE OF THE SERVICE.
      </p>

      <h2>7. Contact</h2>
      <p>
        {COMPANY_NAME}
        <br />
        {COMPANY_ADDRESS}
        <br />
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
      <p>
        Canonical URL: <a href={TERMS_URL}>{TERMS_URL}</a>
      </p>
    </LegalPage>
  );
}
