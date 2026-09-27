import { describe, expect, it } from "vitest";

import { toCsv } from "@/core/shared/csv";

describe("toCsv", () => {
  it("quotes what needs quoting", () => {
    expect(
      toCsv([
        ["email", "name"],
        ["ana@example.org", 'Ana "the builder", Berlin'],
        ["ben@example.org", null],
      ]),
    ).toBe('email,name\r\nana@example.org,"Ana ""the builder"", Berlin"\r\nben@example.org,\r\n');
  });

  it("defuses cells a spreadsheet would run as formulas", () => {
    expect(toCsv([['=HYPERLINK("x")', "+1", "-2", "@SUM(A1)", "Jörg"]])).toBe(
      '"\'=HYPERLINK(""x"")",\'+1,\'-2,\'@SUM(A1),Jörg\r\n',
    );
    // Numbers are data, not formulas.
    expect(toCsv([[-2, 3.5]])).toBe("-2,3.5\r\n");
  });
});
