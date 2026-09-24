/**
 * Curated starter graph templates seeded into the community gallery.
 * Pure data + pure builders — no IO, no React, testable via bun test.
 *
 * Each template is a real directory tree paired with recommended view settings
 * (direction, edge style, theme name). The gallery description carries the
 * settings, since shared graphs deliberately never carry viewer prefs.
 */
import type { TreeEntry, LayoutDirection, EdgeStyle, EdgeStrokeStyle } from "./types";
import { THEME_PRESETS } from "./themePresets";

export interface GraphTemplate {
  slug: string;
  title: string;
  description: string;
  category: string;
  direction: LayoutDirection;
  edgeStyle: EdgeStyle;
  edgeStroke: EdgeStrokeStyle;
  edgeMotion: "none" | "flow" | "pulse";
  cornerRadius: number;
  themeName: string;
  tree: TreeEntry;
}

/** Ponytail: deterministic id prefix — 12+ chars, no randomBytes collision risk. */
export function templateGraphId(slug: string): string {
  return `tpl-${slug}`;
}

function f(name: string, size?: number, children?: TreeEntry[]): TreeEntry {
  return children
    ? { name, type: "folder" as const, children }
    : { name, type: "file" as const, size };
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPHS
// ────────────────────────────────────────────────────────────────────────────

export const TEMPLATE_GRAPHS: GraphTemplate[] = [
  // ── 1. nextjs-saas ────────────────────────────────────────────────────────
  {
    slug: "nextjs-saas",
    title: "Next.js 16 SaaS starter",
    description:
      "App Router project with API routes, components, billing, and docs. ~33 cards. Best viewed LR · angled edges · Blueprint theme.",
    category: "Frontend",
    direction: "LR",
    edgeStyle: "angled",
    edgeStroke: "solid",
    edgeMotion: "none",
    cornerRadius: 8,
    themeName: "Blueprint",
    tree: f("acme-web", undefined, [
      f("app", undefined, [
        f("layout.tsx"),
        f("page.tsx"),
        f("globals.css"),
        f("api", undefined, [
          f("billing", undefined, [f("route.ts")]),
          f("auth", undefined, [f("route.ts")]),
        ]),
      ]),
      f("components", undefined, [
        f("ui", undefined, [f("button.tsx"), f("card.tsx")]),
        f("marketing", undefined, [f("hero.tsx"), f("footer.tsx")]),
      ]),
      f("lib", undefined, [f("db.ts"), f("stripe.ts")]),
      f("public", undefined, [f("logo.svg"), f("og.png")]),
      f("content", undefined, [
        f("docs", undefined, [f("getting-started.md"), f("auth.md")]),
      ]),
      f("package.json", 1200),
      f("next.config.ts", 400),
      f("tsconfig.json", 600),
      f("README.md", 2000),
      f("Dockerfile", 800),
      f(".env.example", 200),
    ]),
  },

  // ── 2. monorepo-workspace ─────────────────────────────────────────────────
  {
    slug: "monorepo-workspace",
    title: "Turborepo monorepo",
    description:
      "Multi-app workspace with shared packages and CI. ~47 cards. Best viewed TB · straight edges · Neon Grid theme.",
    category: "Repo & Infra",
    direction: "TB",
    edgeStyle: "straight",
    edgeStroke: "solid",
    edgeMotion: "none",
    cornerRadius: 0,
    themeName: "Neon Grid",
    tree: f("acme-monorepo", undefined, [
      f("apps", undefined, [
        f("web", undefined, [
          f("app", undefined, [f("layout.tsx"), f("page.tsx"), f("globals.css")]),
          f("lib", undefined, [f("utils.ts")]),
          f("package.json", 900),
        ]),
        f("admin", undefined, [
          f("src", undefined, [f("App.tsx"), f("index.tsx"), f("routes.ts")]),
          f("package.json", 700),
        ]),
        f("docs", undefined, [
          f("content", undefined, [
            f("getting-started.md"),
            f("api-reference.md"),
          ]),
          f("docusaurus.config.ts", 500),
          f("package.json", 600),
        ]),
      ]),
      f("packages", undefined, [
        f("ui", undefined, [
          f("src", undefined, [f("Button.tsx"), f("Card.tsx"), f("index.ts")]),
          f("package.json", 500),
        ]),
        f("config", undefined, [f("eslint.js"), f("tsconfig.base.json")]),
        f("tsconfig", undefined, [f("base.json"), f("next.json")]),
      ]),
      f("tooling", undefined, [
        f("eslint", undefined, [f("index.js")]),
        f("scripts", undefined, [f("release.ts")]),
      ]),
      f(".github", undefined, [
        f("workflows", undefined, [f("ci.yml"), f("deploy.yml")]),
      ]),
      f("turbo.json", 800),
      f("pnpm-workspace.yaml", 200),
      f("package.json", 400),
    ]),
  },

  // ── 3. asset-library ──────────────────────────────────────────────────────
  {
    slug: "asset-library",
    title: "Brand asset library",
    description:
      "Logos, fonts, illustrations, and export formats. ~38 cards. Best viewed TB · curved edges · Ink & Clay theme.",
    category: "Media",
    direction: "TB",
    edgeStyle: "curved",
    edgeStroke: "solid",
    edgeMotion: "none",
    cornerRadius: 0,
    themeName: "Ink & Clay",
    tree: f("brand-assets", undefined, [
      f("brand", undefined, [
        f("mark", undefined, [f("mark.svg", 4000), f("mark.png", 12000)]),
        f("wordmark", undefined, [
          f("wordmark.svg", 6000),
          f("wordmark.png", 18000),
        ]),
        f("combined", undefined, [f("combined.svg", 8000)]),
      ]),
      f("fonts", undefined, [
        f("Inter", undefined, [
          f("Inter-Regular.woff2", 64000),
          f("Inter-Bold.woff2", 66000),
        ]),
        f("JetBrainsMono", undefined, [
          f("JetBrainsMono-Regular.woff2", 58000),
        ]),
      ]),
      f("illustrations", undefined, [
        f("dark", undefined, [
          f("hero-dark.svg", 12000),
          f("feature-dark.svg", 9000),
        ]),
        f("light", undefined, [
          f("hero-light.svg", 12000),
          f("feature-light.svg", 9000),
        ]),
      ]),
      f("exports", undefined, [
        f("svg", undefined, [f("all-marks.svg", 20000)]),
        f("png", undefined, [f("mark-512.png", 30000), f("mark-1024.png", 80000)]),
        f("pdf", undefined, [f("brand-guidelines.pdf", 2400000)]),
      ]),
      f("source", undefined, [f("brand.fig", 4000000), f("palette.ase", 12000)]),
      f("brand-book.pdf", 3200000),
      f("README.md", 1500),
    ]),
  },

  // ── 4. research-paper ─────────────────────────────────────────────────────
  {
    slug: "research-paper",
    title: "Academic paper package",
    description:
      "Manuscript, figures, data, and notebooks for reproducibility. ~26 cards. Best viewed LR · curved edges · Mono Print theme.",
    category: "Data",
    direction: "LR",
    edgeStyle: "curved",
    edgeStroke: "solid",
    edgeMotion: "none",
    cornerRadius: 0,
    themeName: "Mono Print",
    tree: f("paper-2026", undefined, [
      f("manuscript", undefined, [
        f("paper.tex", 14000),
        f("sections", undefined, [
          f("introduction.tex", 3000),
          f("methods.tex", 5000),
          f("results.tex", 4000),
          f("discussion.tex", 3500),
        ]),
      ]),
      f("figures", undefined, [
        f("fig1-overview.pdf", 200000),
        f("fig2-results.pdf", 320000),
        f("fig3-comparison.pdf", 280000),
      ]),
      f("data", undefined, [
        f("raw", undefined, [
          f("measurements.csv", 45000),
          f("survey-responses.csv", 82000),
        ]),
        f("processed", undefined, [
          f("features.parquet", 120000),
          f("labels.parquet", 8000),
        ]),
      ]),
      f("notebooks", undefined, [
        f("01_eda.ipynb", 18000),
        f("02_model.ipynb", 24000),
      ]),
      f("refs.bib", 32000),
      f("Makefile", 1200),
      f("README.md", 800),
    ]),
  },

  // ── 5. media-library ──────────────────────────────────────────────────────
  {
    slug: "media-library",
    title: "Plex-style media library",
    description:
      "Movies, TV series, music, and subtitles. ~54 cards. Best viewed TB · curved edges · Canopy theme. Great for auto-hide threshold demo.",
    category: "Media",
    direction: "TB",
    edgeStyle: "curved",
    edgeStroke: "solid",
    edgeMotion: "none",
    cornerRadius: 0,
    themeName: "Canopy",
    tree: f("media", undefined, [
      f("Movies", undefined, [
        f("1984 (2023)", undefined, [
          f("1984.mkv", 2400000000),
          f("1984.srt", 80000),
        ]),
        f("Arrival (2016)", undefined, [
          f("Arrival.mkv", 3100000000),
          f("Arrival.srt", 95000),
        ]),
        f("Blade Runner 2049 (2017)", undefined, [
          f("BR2049.mkv", 4200000000),
          f("BR2049.srt", 110000),
        ]),
        f("Dune (2021)", undefined, [
          f("Dune.mkv", 3800000000),
          f("Dune.srt", 105000),
        ]),
        f("Everything Everywhere (2022)", undefined, [
          f("EEAAO.mkv", 2900000000),
        ]),
        f("Hereditary (2018)", undefined, [
          f("Hereditary.mkv", 2600000000),
        ]),
        f("Interstellar (2014)", undefined, [
          f("Interstellar.mkv", 5100000000),
        ]),
        f("Parasite (2019)", undefined, [f("Parasite.mkv", 2400000000)]),
      ]),
      f("Series", undefined, [
        f("Severance", undefined, [
          f("Season 01", undefined, [
            f("S01E01.mkv", 1200000000),
            f("S01E02.mkv", 1100000000),
          ]),
          f("Season 02", undefined, [
            f("S02E01.mkv", 1300000000),
            f("S02E02.mkv", 1250000000),
          ]),
        ]),
        f("The Bear", undefined, [
          f("Season 01", undefined, [
            f("S01E01.mkv", 800000000),
            f("S01E02.mkv", 820000000),
          ]),
        ]),
        f("Shogun", undefined, [
          f("Season 01", undefined, [
            f("S01E01.mkv", 1400000000),
            f("S01E02.mkv", 1350000000),
          ]),
        ]),
      ]),
      f("Music", undefined, [
        f("Radiohead", undefined, [
          f("OK Computer", undefined, [
            f("01 - Airbag.flac", 32000000),
            f("02 - Paranoid Android.flac", 48000000),
          ]),
        ]),
        f("Daft Punk", undefined, [
          f("Random Access Memories", undefined, [
            f("01 - Give Life Back to Music.flac", 42000000),
            f("02 - The Game of Love.flac", 35000000),
          ]),
        ]),
      ]),
      f("Subtitles", undefined, [
        f("en", undefined, [f("1984.srt", 80000)]),
        f("ja", undefined, [f("1984.srt", 95000)]),
        f("de", undefined, [f("1984.srt", 88000)]),
      ]),
    ]),
  },

  // ── 6. release-pack ───────────────────────────────────────────────────────
  {
    slug: "release-pack",
    title: "CLI release package",
    description:
      "Binary, licenses, completions, and checksums for acme-cli v1.4.0. ~20 cards. Best viewed LR · angled edges · Terminal Amber theme.",
    category: "Ops",
    direction: "LR",
    edgeStyle: "angled",
    edgeStroke: "solid",
    edgeMotion: "none",
    cornerRadius: 8,
    themeName: "Terminal Amber",
    tree: f("acme-cli-1.4.0", undefined, [
      f("bin", undefined, [f("acme", 4200000)]),
      f("lib", undefined, [
        f("libacme.so", 1800000),
        f("libacme.a", 900000),
      ]),
      f("share", undefined, [
        f("man", undefined, [f("acme.1", 4000)]),
        f("completions", undefined, [
          f("acme.bash", 1200),
          f("acme.zsh", 1400),
          f("acme.fish", 900),
        ]),
      ]),
      f("licenses", undefined, [
        f("LICENSE", 1100),
        f("NOTICE", 600),
        f("THIRD-PARTY.md", 8000),
      ]),
      f("checksums.txt", 300),
      f("CHANGELOG.md", 4500),
      f("acme-1.4.0.tar.gz", 12000000),
    ]),
  },

  // ── 7. docs-site ──────────────────────────────────────────────────────────
  {
    slug: "docs-site",
    title: "Documentation site",
    description:
      "Multi-language docs with snippets and MDX. ~32 cards. Best viewed LR · dotted curved edges · Slate Highlighter theme.",
    category: "Docs",
    direction: "LR",
    edgeStyle: "curved",
    edgeStroke: "dotted",
    edgeMotion: "none",
    cornerRadius: 0,
    themeName: "Slate Highlighter",
    tree: f("acme-docs", undefined, [
      f("content", undefined, [
        f("docs", undefined, [
          f("getting-started.md", 3200),
          f("installation.md", 2800),
          f("configuration.md", 4100),
          f("api-reference.md", 8500),
          f("authentication.md", 3600),
          f("deployment.md", 5200),
          f("migration-guide.md", 6400),
          f("troubleshooting.md", 2900),
          f("changelog.md", 12000),
        ]),
      ]),
      f("i18n", undefined, [
        f("en", undefined, [
          f("common.json", 4000),
          f("sidebar.json", 1200),
        ]),
        f("de", undefined, [
          f("common.json", 4800),
          f("sidebar.json", 1400),
        ]),
        f("ja", undefined, [
          f("common.json", 5200),
          f("sidebar.json", 1600),
        ]),
      ]),
      f("snippets", undefined, [
        f("quickstart.mdx", 2000),
        f("auth-example.mdx", 1800),
        f("deploy-command.mdx", 800),
      ]),
      f("static", undefined, [
        f("img", undefined, [f("logo.svg", 2000), f("diagram.png", 40000)]),
      ]),
      f("docusaurus.config.ts", 2400),
      f("sidebars.ts", 1600),
      f("package.json", 800),
    ]),
  },

  // ── 8. ml-experiments ─────────────────────────────────────────────────────
  {
    slug: "ml-experiments",
    title: "ML experiment repo",
    description:
      "Source, configs, experiment runs, and notebooks for model training. ~36 cards. Best viewed TB · dashed curved edges · Aurora Depth theme.",
    category: "Data",
    direction: "TB",
    edgeStyle: "curved",
    edgeStroke: "dashed",
    edgeMotion: "none",
    cornerRadius: 0,
    themeName: "Aurora Depth",
    tree: f("ml-project", undefined, [
      f("src", undefined, [
        f("data", undefined, [
          f("loader.py", 3200),
          f("transforms.py", 4800),
        ]),
        f("models", undefined, [
          f("transformer.py", 8500),
          f("baseline.py", 2100),
        ]),
        f("train.py", 6200),
        f("infer.py", 2800),
        f("evaluate.py", 3400),
      ]),
      f("configs", undefined, [
        f("base.yaml", 600),
        f("prod.yaml", 800),
        f("experiment.yaml", 900),
      ]),
      f("experiments", undefined, [
        f("runs", undefined, [
          f("2026-09-01", undefined, [
            f("metrics.json", 1200),
            f("config.yaml", 700),
            f("model.pt", 240000000),
          ]),
          f("2026-09-14", undefined, [
            f("metrics.json", 1400),
            f("config.yaml", 750),
            f("model.pt", 260000000),
          ]),
        ]),
      ]),
      f("data", undefined, [
        f("raw", undefined, [
          f("train.parquet", 48000000),
          f("val.parquet", 6000000),
          f("test.parquet", 6000000),
        ]),
        f("processed", undefined, [
          f("features-v2.parquet", 12000000),
          f("labels-v2.parquet", 200000),
        ]),
      ]),
      f("notebooks", undefined, [
        f("01_eda.ipynb", 22000),
        f("02_feature_engineering.ipynb", 34000),
        f("03_model_comparison.ipynb", 28000),
      ]),
      f("requirements.txt", 400),
      f("README.md", 1800),
    ]),
  },
];

/**
 * Resolve a theme preset by name. Returns the CustomTheme JSON or undefined.
 */
export function resolveTemplateTheme(themeName: string) {
  return THEME_PRESETS.find((p) => p.name === themeName)?.theme;
}

/** All unique slugs — used by the seeder script. */
export const TEMPLATE_SLUGS = TEMPLATE_GRAPHS.map((t) => t.slug);
