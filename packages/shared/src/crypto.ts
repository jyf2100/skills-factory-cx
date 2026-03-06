import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function sha256Buffer(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256String(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function ensureEd25519Keypair(privatePath: string, publicPath: string): void {
  try {
    readFileSync(privatePath, "utf8");
    readFileSync(publicPath, "utf8");
    return;
  } catch {
    mkdirSync(dirname(privatePath), { recursive: true });
    mkdirSync(dirname(publicPath), { recursive: true });
    const pair = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" }
    });
    writeFileSync(privatePath, pair.privateKey, "utf8");
    writeFileSync(publicPath, pair.publicKey, "utf8");
  }
}

export function signHashHex(hashHex: string, privatePem: string): string {
  const key = createPrivateKey(privatePem);
  return sign(null, Buffer.from(hashHex, "hex"), key).toString("base64");
}

export function verifyHashSignature(hashHex: string, signatureBase64: string, publicPem: string): boolean {
  const key = createPublicKey(publicPem);
  return verify(null, Buffer.from(hashHex, "hex"), key, Buffer.from(signatureBase64, "base64"));
}
