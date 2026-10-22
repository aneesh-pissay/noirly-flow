import { describe, expect, it } from "vitest";
import { scopeAllows, tokenHint, tokenScope } from "@/src/core/access-tokens";

const secret = "a".repeat(43);

describe("tokenScope", () => {
  it("reads the scope letter of a well-formed token", () => {
    expect(tokenScope(`nfp_r_${secret}`)).toBe("read");
    expect(tokenScope(`nfp_w_${secret}`)).toBe("write");
    expect(tokenScope(`nfp_x_${secret}`)).toBeNull();
    expect(tokenScope("nfp_w_short")).toBeNull();
    expect(tokenScope("eyJhbGciOi.identity.jwt")).toBeNull();
  });
});

describe("scopeAllows", () => {
  it("lets read tokens read only", () => {
    expect(scopeAllows("read", "GET")).toBe(true);
    expect(scopeAllows("read", "head")).toBe(true);
    expect(scopeAllows("read", "POST")).toBe(false);
    expect(scopeAllows("read", "DELETE")).toBe(false);
    expect(scopeAllows("write", "PATCH")).toBe(true);
  });
});

describe("tokenHint", () => {
  it("shows the start and end only", () => {
    expect(tokenHint(`nfp_w_abcd${"x".repeat(35)}wxyz`)).toBe("nfp_w_abcd…wxyz");
  });
});
