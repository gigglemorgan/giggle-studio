import React from "react";

interface GiggleLogoProps {
  className?: string;
  size?: number;
}

export const GiggleLogo: React.FC<GiggleLogoProps> = ({ className = "", size = 28 }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-label="Giggle Studio Logo"
    >
      <rect width="40" height="40" rx="10" className="fill-card border border-border" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="9.5" className="stroke-border" strokeWidth="1" />
      <circle cx="13" cy="15" r="3" className="fill-primary" />
      <circle cx="27" cy="15" r="3" className="fill-primary" />
      <path
        d="M12 23C13.5 28.5 26.5 28.5 28 23"
        className="stroke-primary"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
};
