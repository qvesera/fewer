import type { Metadata } from "next";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark tabular-nums" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased text-pretty bg-background text-foreground`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:border focus:border-border focus:rounded-md focus:shadow-lg"
        >
          Skip to main content
        </a>
        <ThemeProvider>{children}<Toaster /></ThemeProvider>
      </body>
    </html>
  );
}
