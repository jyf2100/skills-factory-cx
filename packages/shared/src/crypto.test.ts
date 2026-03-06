import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureEd25519Keypair, signHashHex, verifyHashSignature } from "./crypto.js";

describe("crypto", () => {
  it("signs and verifies hash", () => {
    const dir = mkdtempSync(join(tmpdir(), "skills-shared-"));
    const privatePath = join(dir, "private.pem");
    const publicPath = join(dir, "public.pem");

    ensureEd25519Keypair(privatePath, publicPath);
    const privatePem = readFileSync(privatePath, "utf8");
    const publicPem = readFileSync(publicPath, "utf8");

    const hash = "f".repeat(64);
    const signature = signHashHex(hash, privatePem);

    expect(verifyHashSignature(hash, signature, publicPem)).toBe(true);
    expect(verifyHashSignature("0".repeat(64), signature, publicPem)).toBe(false);
  });
});
