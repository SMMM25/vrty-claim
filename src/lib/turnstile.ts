/**
 * Cloudflare Turnstile server-side verification.
 * If TURNSTILE_SECRET_KEY is unset, verification is skipped (dev mode).
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string
): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "Captcha is not configured." };
    }
    return { ok: true };
  }

  if (!token) {
    return { ok: false, reason: "Captcha token missing." };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body }
  );

  if (!res.ok) {
    return { ok: false, reason: "Captcha verification failed." };
  }

  const data = (await res.json()) as { success?: boolean };
  if (!data.success) {
    return { ok: false, reason: "Captcha rejected." };
  }
  return { ok: true };
}
