import { describe, expect, test } from "bun:test";

import { isPotentialCssRootFile } from "../src/index";

describe("isPotentialCssRootFile", () => {
  test("accepts plain css files", () => {
    expect(isPotentialCssRootFile("/tmp/app.css")).toBe(true);
  });

  test("rejects bun internals and asset queries", () => {
    expect(isPotentialCssRootFile("/tmp/.bun/app.css")).toBe(false);
    expect(isPotentialCssRootFile("/tmp/app.css?url")).toBe(false);
    expect(isPotentialCssRootFile("/tmp/app.css?worker")).toBe(false);
    expect(isPotentialCssRootFile("/tmp/app.css?commonjs-proxy")).toBe(false);
  });
});
