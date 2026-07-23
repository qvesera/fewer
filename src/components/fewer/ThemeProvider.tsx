"use client";

/**
 * Minimal theme provider that avoids next-themes's internal <script> tag
 * which Next.js 16 flags as an error. Injects the theme-init script via
 * dangerouslySetInnerHTML and manages the .dark class + data-theme attribute
 * directly on <html>.
 */

import { useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "fewer-theme";

const SCRIPT = `
(function() {
  try {
    var theme = localStorage.getItem('${STORAGE_KEY}') || 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
  } catch(e) {}
})();
`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Re-apply the stored theme on mount (hydration)
    const stored = localStorage.getItem(STORAGE_KEY) || "dark";
    document.documentElement.classList.toggle("dark", stored === "dark");
    document.documentElement.style.colorScheme = stored;
    document.documentElement.setAttribute("data-theme", stored);
    setMounted(true);
  }, []);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: SCRIPT }}
        suppressHydrationWarning
      />
      {children}
    </>
  );
}
