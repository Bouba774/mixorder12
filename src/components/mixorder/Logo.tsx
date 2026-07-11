import logo from "@/assets/mixorder-logo.asset.json";

interface LogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export function Logo({ size = 40, className = "", glow = false }: LogoProps) {
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {glow && (
        <div
          aria-hidden
          className="absolute inset-0 -z-10 rounded-[28%] bg-gradient-gold blur-2xl opacity-40 animate-ambient"
        />
      )}
      <img
        src={logo.url}
        alt="MixOrder"
        width={size}
        height={size}
        className="rounded-[22%] shadow-elevated"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
