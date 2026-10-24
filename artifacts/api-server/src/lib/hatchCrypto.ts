import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Encrypts the Hatch password at rest (AES-256-GCM). The key is derived from
// SESSION_SECRET, which production already has, so there is no extra setup.
// If that secret ever changes, stored passwords simply stop decrypting and the
// household reconnects Hatch. A stolen database copy alone can't read them.

function keyFor(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "homehub-hatch", "hatch-credentials-v1", 32));
}

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Returns null for anything that doesn't decrypt cleanly: wrong secret, tampering, or an unknown format. */
export function decryptSecret(token: string, secret: string): string | null {
  try {
    const [version, iv, tag, ciphertext, ...extra] = token.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext || extra.length > 0) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
