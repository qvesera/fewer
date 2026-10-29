"use client";

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export function Logo({ className, size = 28, showText = false }: LogoProps) {
  // Aspect from the source of record: viewBox 130.69282 × 117.71568 → 1.11:1
  const width = Math.round(size * 1.11);
  
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <img
        src="/logo.svg"
        alt="fewer logo"
        width={width}
        height={size}
        className="shrink-0 h-auto w-auto"
        style={{ height: size, width, maxWidth: "none" }}
      />
      {showText && <span className="text-xl font-bold tracking-tight text-foreground ml-3">fewer</span>}
    </div>
  );
}
