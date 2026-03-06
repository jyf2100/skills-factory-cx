import { describe, expect, it } from "vitest";
import { addSource } from "./source.js";

describe("source commands", () => {
  it("adds source once", () => {
    const cfg = { sources: ["http://a"], install_dir: "/tmp/skills" };
    addSource(cfg, "http://b");
    addSource(cfg, "http://b");
    expect(cfg.sources).toEqual(["http://a", "http://b"]);
  });
});
