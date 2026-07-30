import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import {
  PRIVACY_URL,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
} from "@/lib/site-links";

export const metadata: Metadata = {
  title: "Privacy Policy | VRTY Claim",
  description: "Privacy Policy for the VRTY Claim portal.",
  alternates: { canonical: PRIVACY_URL },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Last updated: July 30, 2026. {PRODUCT_NAME} describes below how we
        handle information when you use the VRTY Claim portal.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>XRPL wallet address</strong> — when you connect a wallet or
          submit a claim, to verify eligibility and record successful claims.
        </li>
        <li>
          <strong>IP address</strong> — for rate limiting, one-claim-per-IP
          enforcement, and abuse prevention.
        </li>
        <li>
          <strong>Claim metadata</strong> — timestamps, transaction hashes, and
          eligibility check results stored in our database.
        </li>
        <li>
          <strong>Captcha tokens</strong> — processed by Cloudflare Turnstile to
          verify human use; we do not store raw captcha responses long term.
        </li>
      </ul>

      <h2>2. What we do not collect</h2>
      <p>
        We do not collect or store your wallet secret keys, secret numbers, or
        passphrases. Signing happens in your wallet (Xaman, extension, or
        WalletConnect).
      </p>

      <h2>3. How we use information</h2>
      <p>
        We use the data above solely to operate the claim program, prevent
        fraud and sybil attacks, enforce the one-claim-per-wallet and
        one-claim-per-IP rules, and maintain service security.
      </p>

      <h2>4. Third parties</h2>
      <ul>
        <li>
          <strong>Cloudflare Turnstile</strong> — bot protection (see Cloudflare
          privacy policy).
        </li>
        <li>
          <strong>Xaman / XRPL Labs</strong> — wallet sign-in and transaction
          signing when you choose Xaman.
        </li>
        <li>
          <strong>Railway</strong> — application and database hosting.
        </li>
        <li>
          <strong>Public XRPL nodes</strong> — ledger reads for balance and
          eligibility verification.
        </li>
      </ul>

      <h2>5. Retention</h2>
      <p>
        Successful claim records are retained to prevent duplicate claims and
        for audit purposes. You may contact us to ask about data tied to your
        wallet address.
      </p>

      <h2>6. Your rights</h2>
      <p>
        Depending on your jurisdiction you may have rights to access or correct
        personal information we hold. Contact us at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>7. Contact</h2>
      <p>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
