"use client";

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export function Logo({ className, size = 28, showText = false }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <img
        src="/logo.png"
        alt="fewer logo"
        height={size}
        className="shrink-0 h-auto w-auto"
        style={{ height: size, width: "auto", maxWidth: "none" }}
      />
      {showText && <span className="text-sm font-bold tracking-tight">fewer</span>}
    </div>
  );
}
