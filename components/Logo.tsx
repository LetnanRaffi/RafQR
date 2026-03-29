'use client';

/**
 * Clean Monochrome Logo Component
 */
export const Logo = ({ 
  size = 32, 
  smSize = 40,
  className = "" 
}: { 
  size?: number, 
  smSize?: number,
  className?: string 
}) => {
  return (
    <div 
      className={`relative flex items-center justify-center shrink-0 ${className}`} 
      style={{ width: size, height: size }}
    >
      {/* Use CSS variables or just keep it simple with size prop */}
      <svg 
        width="100%"
        height="100%"
        viewBox="0 0 32 32" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M0 0H32V32H0V0Z" fill="white"/>
        <path d="M4 4H12V12H4V4ZM4 20H12V28H4V20ZM20 4H28V12H20V4Z" fill="black"/>
        <path d="M20 20H24V24H20V20ZM24 24H28V28H24V24ZM20 25H22V28H20V25ZM25 20H28V22H25V20Z" fill="black"/>
        <rect x="6" y="6" width="4" height="4" fill="white" opacity="0.2"/>
        <rect x="22" y="6" width="4" height="4" fill="white" opacity="0.2"/>
        <rect x="6" y="22" width="4" height="4" fill="white" opacity="0.2"/>
      </svg>
    </div>
  );
};
