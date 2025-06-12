import crypto from "crypto";

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `hk_${crypto.randomBytes(32).toString("hex")}`;
  const hash = hashApiKey(key);
  const prefix = key.substring(0, 10);
  
  return { key, hash, prefix };
}