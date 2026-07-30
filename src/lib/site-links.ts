/** Public contact and legal URLs for the claim portal and xApp manifest. */

export const COMPANY_NAME = "2562870 Ontario Inc.";
export const PRODUCT_NAME = "Verity Protocol";
export const SUPPORT_EMAIL = "info@verityprotocol.io";
export const SUPPORT_PHONE = "(905) 392-0778";
export const COMPANY_ADDRESS =
  "1190 Twinney Dr. #8, Newmarket, Ontario, Canada L3Y 9E3";

export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim() ||
  "https://claim.verityprotocol.io";

export const MAIN_SITE = "https://www.verityprotocol.io";
export const GITHUB_ISSUES = "https://github.com/SMMM25/vrty-claim/issues";
export const GITHUB_REPO = "https://github.com/SMMM25/vrty-claim";

export const TERMS_PATH = "/terms";
export const PRIVACY_PATH = "/privacy";
export const SUPPORT_PATH = "/support";

export const TERMS_URL = `${SITE_ORIGIN}${TERMS_PATH}`;
export const PRIVACY_URL = `${SITE_ORIGIN}${PRIVACY_PATH}`;
export const SUPPORT_URL = `${SITE_ORIGIN}${SUPPORT_PATH}`;
