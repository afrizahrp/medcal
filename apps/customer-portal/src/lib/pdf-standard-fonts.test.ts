import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * public/pdfjs/standard_fonts is a copy of the fonts shipped with the pinned
 * pdfjs-dist. If pdfjs-dist is upgraded without re-copying them, certificates
 * would render with fonts that do not belong to the PDF.js version in use.
 * To refresh: copy node_modules/pdfjs-dist/standard_fonts/* over the folder.
 */
describe("bundled PDF.js standard fonts", () => {
  const require = createRequire(import.meta.url);
  const packaged = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts");
  const bundled = path.resolve(__dirname, "../../public/pdfjs/standard_fonts");

  it("are identical to the ones shipped with the installed pdfjs-dist", () => {
    const names = readdirSync(packaged).sort();
    expect(readdirSync(bundled).sort()).toEqual(names);
    for (const name of names) {
      expect(readFileSync(path.join(bundled, name)).equals(readFileSync(path.join(packaged, name))), name).toBe(true);
    }
  });
});
