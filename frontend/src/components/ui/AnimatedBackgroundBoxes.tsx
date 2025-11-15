import React, { useState, useEffect, useMemo } from 'react';

interface Box {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

const COLOR_PALETTE = [
  '#a7f3d0', // mint green
  '#fef3c7', // lemon yellow
  '#d1fae5', // light green
  '#fde68a', // pale yellow
];

// Responsive box sizes
const BOX_SIZES_DESKTOP = [
  { width: 120, height: 80 },
  { width: 160, height: 100 },
  { width: 200, height: 120 },
  { width: 100, height: 150 },
  { width: 140, height: 90 },
];

const BOX_SIZES_MOBILE = [
  { width: 80, height: 60 },
  { width: 100, height: 70 },
  { width: 120, height: 80 },
  { width: 70, height: 100 },
];

interface AnimatedBackgroundBoxesProps {
  boxCount?: number;
  changeInterval?: number;
}

export const AnimatedBackgroundBoxes: React.FC<AnimatedBackgroundBoxesProps> = ({
  boxCount = 18,
  changeInterval = 4000, // 4 seconds
}) => {
  // Detect screen size for responsive box count
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Adjust box count for mobile
  const actualBoxCount = useMemo(() => {
    return isMobile ? Math.min(boxCount, 10) : boxCount;
  }, [isMobile, boxCount]);

  // Generate initial boxes with random positions and colors
  const initialBoxes = useMemo(() => {
    const sizes = isMobile ? BOX_SIZES_MOBILE : BOX_SIZES_DESKTOP;
    // Use default viewport dimensions for SSR safety
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
    
    return Array.from({ length: actualBoxCount }, (_, i) => {
      const size = sizes[Math.floor(Math.random() * sizes.length)];
      // Calculate max position to keep boxes within viewport
      const maxX = Math.max(0, 100 - (size.width / viewportWidth) * 100);
      const maxY = Math.max(0, 100 - (size.height / viewportHeight) * 100);
      
      return {
        id: i,
        x: Math.max(0, Math.min(maxX, Math.random() * 85)),
        y: Math.max(0, Math.min(maxY, Math.random() * 85)),
        width: size.width,
        height: size.height,
        color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)],
      };
    });
  }, [actualBoxCount, isMobile]);

  const [boxes, setBoxes] = useState<Box[]>(initialBoxes);

  // Regenerate boxes when screen size changes
  useEffect(() => {
    setBoxes(initialBoxes);
  }, [initialBoxes]);

  // Animate color changes
  useEffect(() => {
    const interval = setInterval(() => {
      setBoxes((prevBoxes) =>
        prevBoxes.map((box) => ({
          ...box,
          color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)],
        }))
      );
    }, changeInterval);

    return () => clearInterval(interval);
  }, [changeInterval]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      {boxes.map((box) => (
        <div
          key={box.id}
          className="absolute rounded-lg transition-colors duration-1000 ease-in-out"
          style={{
            left: `${box.x}%`,
            top: `${box.y}%`,
            width: `${box.width}px`,
            height: `${box.height}px`,
            backgroundColor: box.color,
            opacity: 0.35,
            transform: 'rotate(0deg)',
          }}
        />
      ))}
    </div>
  );
};

