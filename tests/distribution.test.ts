import { describe, expect, it } from "vitest";
import { describeEngineResult } from "@/lib/distribution";

describe("describeEngineResult", () => {
  it("explains an empty distribution wallet in plain language", () => {
    expect(describeEngineResult("tecPATH_DRY")).toMatch(/out of VRTY/i);
    expect(describeEngineResult("tecUNFUNDED_PAYMENT")).toMatch(/out of VRTY/i);
  });

  it("explains a missing trust line", () => {
    expect(describeEngineResult("tecNO_LINE")).toMatch(/trust line/i);
  });

  it("explains a destination that cannot receive the claim", () => {
    expect(describeEngineResult("tecDST_TAG_NEEDED")).toMatch(
      /destination tag/i
    );
    expect(describeEngineResult("tecNO_DST")).toMatch(/not funded/i);
  });

  it("falls back to the raw code for anything unexpected", () => {
    expect(describeEngineResult("tecSOMETHING_NEW")).toContain(
      "tecSOMETHING_NEW"
    );
  });
});
