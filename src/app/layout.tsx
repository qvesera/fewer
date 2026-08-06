import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/fewer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export const metadata: Metadata = {
  title: "fewer | Interactive Directory Graph Visualizer",
  description:
    "Transform your file system navigation into an art form. Interactive graph-based directory visualization with React Flow, Dagre auto-layout, 7 export formats, keyboard-first navigation, custom themes, and real file system integration.",
  keywords: [
    "fewer",
    "directory visualization",
    "file system graph",
    "React Flow",
    "Dagre",
    "directory tree visualizer",
    "folder structure tool",
    "file explorer graph",
    "project structure viewer",
    "directory mapper",
    "interactive graph",
    "node-based UI",
    "TypeScript",
    "Next.js",
    "Tailwind CSS",
    "shadcn ui",
    "Zustand",
    "keyboard navigation",
    "file system access API",
    "SVG export",
    "PNG export",
    "codebase visualization",
    "directory analysis",
    "open source",
  ],
  authors: [{ name: "Yash Srivastava" }],
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark tabular-nums" suppressHydrationWarning>
      <head>
        {/* Resource hints for third-party origins */}
        <link rel="preconnect" href="https://cdn.segment.com" />
        <link rel="preconnect" href="https://app.netlify.com" />
        <link rel="dns-prefetch" href="https://cdn.segment.com" />
        <link rel="dns-prefetch" href="https://app.netlify.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased text-pretty bg-background text-foreground`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:border focus:border-border focus:rounded-md focus:shadow-lg"
        >
          Skip to main content
        </a>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var VARS={background:'--fewer-background',defaultText:'--fewer-text',subtleText:'--fewer-text-subtle',itemHover:'--fewer-item-hover',handle:'--fewer-handle',edge:'--fewer-edge',folderBg:'--fewer-folder-bg',folderBorder:'--fewer-folder-border',folderText:'--fewer-folder-text',folderIcon:'--fewer-folder-icon',fileBg:'--fewer-file-bg',fileText:'--fewer-file-text',fileSubtleText:'--fewer-file-subtle-text',fileBorder:'--fewer-file-border',fileIcon:'--fewer-file-icon'};function hexRgb(h){var m=/^#?([0-9a-fA-F]{6})$/.exec((h||'').trim());if(!m)return null;var n=parseInt(m[1],16);return{r:(n>>16)&255,g:(n>>8)&255,b:n&255}}function css(c,o){var rgb=hexRgb(c);if(!rgb)return c||'#000';var a=Math.min(1,Math.max(0,Math.round((Number(o)||1)*100)/100));if(a>=1){return '#'+rgb.r.toString(16).padStart(2,'0')+rgb.g.toString(16).padStart(2,'0')+rgb.b.toString(16).padStart(2,'0')}return 'rgba('+rgb.r+', '+rgb.g+', '+rgb.b+', '+a+')'}try{var t=localStorage.getItem('fewer-theme')||'light';document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t;document.documentElement.setAttribute('data-theme',t);if(t==='custom'){var raw=localStorage.getItem('fewer-custom-theme');if(raw){var th=JSON.parse(raw);var st=document.documentElement.style;for(var k in VARS){var c=th&&th[k];if(c&&c.color){st.setProperty(VARS[k],css(c.color,c.opacity))}}}}}catch(e){}})();`,
          }}
        />
        <ThemeProvider>{children}<Toaster /></ThemeProvider>
      </body>
    </html>
  );
}
