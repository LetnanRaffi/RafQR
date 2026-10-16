'use client';

/** QRData mark: ink tile, accent glyph. Matches `.brand .mark` in the design tokens. */
export const Logo = ({ size = 28, className = '' }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    className={className}
  >
    <path d="M0 0H32V32H0V0Z" fill="#111113" />
    <path d="M7 7H14V14H7V7ZM7 18H14V25H7V18ZM18 7H25V14H18V7Z" fill="#FACC15" />
    <path
      d="M18 18H21.5V21.5H18V18ZM21.5 21.5H25V25H21.5V21.5ZM18 22.5H20.5V25H18V22.5ZM23.5 18H25V20.5H23.5V18Z"
      fill="#FACC15"
    />
  </svg>
);
