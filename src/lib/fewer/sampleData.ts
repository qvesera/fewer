import type { TreeEntry } from "./types";

/**
 * A representative Next.js project tree used as the default dataset
 * so users can see the app working without granting file-system access.
 */
export const SAMPLE_TREE: TreeEntry = {
  name: "fewer",
  type: "folder",
  children: [
    {
      name: "src",
      type: "folder",
      children: [
        {
          name: "components",
          type: "folder",
          children: [
            { name: "App.tsx", type: "file", size: 4200 },
            { name: "CustomNode.tsx", type: "file", size: 3100 },
            { name: "GraphCanvas.tsx", type: "file", size: 5800 },
            { name: "ExportPanel.tsx", type: "file", size: 2700 },
            { name: "CollaborationProvider.tsx", type: "file", size: 3400 },
            { name: "ErrorBoundary.tsx", type: "file", size: 1200 },
            { name: "ThemeProvider.tsx", type: "file", size: 900 },
          ],
        },
        {
          name: "hooks",
          type: "folder",
          children: [
            { name: "useGraphOperations.ts", type: "file", size: 4500 },
            { name: "useFileSystem.ts", type: "file", size: 2300 },
            { name: "useUndoRedo.ts", type: "file", size: 1800 },
          ],
        },
        {
          name: "utils",
          type: "folder",
          children: [
            { name: "exportUtils.ts", type: "file", size: 5200 },
            { name: "layout.ts", type: "file", size: 1400 },
            { name: "graphHelpers.ts", type: "file", size: 1900 },
          ],
        },
        {
          name: "types",
          type: "folder",
          children: [{ name: "index.ts", type: "file", size: 1100 }],
        },
        { name: "App.tsx", type: "file", size: 1500 },
        { name: "main.tsx", type: "file", size: 480 },
        { name: "index.css", type: "file", size: 2300 },
      ],
    },
    {
      name: "public",
      type: "folder",
      children: [
        { name: "logo.svg", type: "file", size: 2200 },
        { name: "favicon.ico", type: "file", size: 4300 },
        { name: "banner.png", type: "file", size: 184000 },
      ],
    },
    {
      name: "tests",
      type: "folder",
      children: [
        { name: "App.test.tsx", type: "file", size: 2600 },
        { name: "export.test.ts", type: "file", size: 1900 },
        { name: "fixtures.json", type: "file", size: 8700 },
      ],
    },
    { name: "package.json", type: "file", size: 1900 },
    { name: "tsconfig.json", type: "file", size: 720 },
    { name: "vite.config.ts", type: "file", size: 880 },
    { name: "tailwind.config.js", type: "file", size: 1100 },
    { name: "README.md", type: "file", size: 9800 },
    { name: "LICENSE", type: "file", size: 1060 },
    { name: ".env.example", type: "file", size: 410 },
  ],
};

/**
 * A second, deeper tree used by the "Load demo data" button to showcase
 * a more complex graph.
 */
export const ADVANCED_TREE: TreeEntry = {
  name: "monorepo-root",
  type: "folder",
  children: [
    {
      name: "packages",
      type: "folder",
      children: [
        {
          name: "web-app",
          type: "folder",
          children: [
            {
              name: "src",
              type: "folder",
              children: [
                { name: "index.tsx", type: "file", size: 540 },
                { name: "App.tsx", type: "file", size: 3100 },
                { name: "router.tsx", type: "file", size: 1500 },
                { name: "store.ts", type: "file", size: 2200 },
              ],
            },
            { name: "package.json", type: "file", size: 880 },
            { name: "tsconfig.json", type: "file", size: 690 },
          ],
        },
        {
          name: "api-server",
          type: "folder",
          children: [
            {
              name: "src",
              type: "folder",
              children: [
                { name: "server.ts", type: "file", size: 2700 },
                { name: "routes.ts", type: "file", size: 4100 },
                { name: "db.ts", type: "file", size: 1900 },
              ],
            },
            { name: "package.json", type: "file", size: 760 },
          ],
        },
        {
          name: "shared-types",
          type: "folder",
          children: [
            { name: "index.ts", type: "file", size: 2300 },
            { name: "package.json", type: "file", size: 540 },
          ],
        },
      ],
    },
    {
      name: "docs",
      type: "folder",
      children: [
        { name: "getting-started.md", type: "file", size: 4500 },
        { name: "architecture.md", type: "file", size: 7800 },
        { name: "api-reference.md", type: "file", size: 12300 },
      ],
    },
    {
      name: "scripts",
      type: "folder",
      children: [
        { name: "build.sh", type: "file", size: 980 },
        { name: "deploy.sh", type: "file", size: 1300 },
        { name: "release.py", type: "file", size: 2100 },
      ],
    },
    { name: "package.json", type: "file", size: 1100 },
    { name: "pnpm-workspace.yaml", type: "file", size: 320 },
    { name: "README.md", type: "file", size: 5600 },
    { name: ".gitignore", type: "file", size: 410 },
  ],
};
