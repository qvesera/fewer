"use client";

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export function Logo({ className, size = 28, showText = false }: LogoProps) {
  // Calculate width based on logo aspect ratio (approximately 1.09:1)
  const width = Math.round(size * 1.09);
  
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <img
        src="/logo.png"
        alt="fewer logo"
        width={width}
        height={size}
        className="shrink-0 h-auto w-auto"
        style={{ height: size, width, maxWidth: "none" }}
      />
      {showText && <span className="text-xl font-bold tracking-tight text-gradient-fewer ml-3">fewer</span>}
    </div>
  );
}
