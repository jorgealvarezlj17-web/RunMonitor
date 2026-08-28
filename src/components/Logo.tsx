import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ className = "", size = 48 }) => {
  return (
    <img 
      src="/icon.svg" 
      alt="Logo" 
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
};
