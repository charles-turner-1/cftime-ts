// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";
import { visit } from "unist-util-visit";

/** GitHub Pages project-site base path; the site lives under this prefix. */
const BASE = "/cftime-ts";

/**
 * Prepend the site base to root-relative links written in Markdown/MDX content
 * (e.g. `/getting-started/`). Starlight's own nav is already base-aware, but
 * hand-authored `/…` links are emitted verbatim and would 404 under the base.
 */
function rehypeBaseLinks() {
  return (/** @type {import("hast").Root} */ tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string") return;
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (href === BASE || href.startsWith(`${BASE}/`)) return;
      node.properties.href = BASE + href;
    });
  };
}

// https://astro.build/config
export default defineConfig({
  // Project pages URL: https://charles-turner-1.github.io/cftime-ts/
  site: "https://charles-turner-1.github.io",
  base: BASE,
  integrations: [
    starlight({
      title: "cftime-ts",
      description:
        "A TypeScript port of Python cftime: CF-convention calendar datetimes, num2date / date2num, and nine CF calendars.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/charles-turner-1/cftime-ts",
        },
      ],
      plugins: [
        // Generate the API reference from the library's TSDoc.
        starlightTypeDoc({
          entryPoints: ["../src/index.ts"],
          tsconfig: "../tsconfig.json",
          sidebar: { label: "API reference", collapsed: true },
          typeDoc: {
            excludeInternal: true,
            gitRevision: "main",
            // The library is type-checked by its own CI (tsc). TypeDoc's extra
            // diagnostic pass otherwise trips over the anonymous subclass factory
            // in datetime.ts (TS4094 on the legacy Datetime* classes), which is a
            // declaration-emit quirk, not a real error.
            skipErrorChecking: true,
          },
        }),
      ],
      sidebar: [
        {
          label: "Start here",
          items: ["index", "install", "getting-started"],
        },
        {
          label: "Guide",
          items: [
            "guide/calendars",
            "guide/num2date-date2num",
            "guide/datetime",
            "guide/arithmetic",
            "guide/indexing",
          ],
        },
        // API reference group, populated by starlight-typedoc.
        typeDocSidebarGroup,
      ],
    }),
  ],
  markdown: {
    // MDX inherits these; keep code blocks readable in the guide pages.
    shikiConfig: { themes: { light: "github-light", dark: "github-dark" } },
    rehypePlugins: [rehypeBaseLinks],
  },
});
