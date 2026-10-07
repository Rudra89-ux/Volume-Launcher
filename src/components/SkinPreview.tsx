import React, { useEffect, useRef } from 'react';

interface SkinPreviewProps {
  skinDataUrl?: string | null;
  skinModel?: 'classic' | 'slim';
  width?: number;
  height?: number;
}

export const SkinPreview: React.FC<SkinPreviewProps> = ({
  skinDataUrl,
  skinModel = 'classic',
  width = 96,
  height = 136,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!skinDataUrl) {
      // Draw placeholder explorer silhouette
      ctx.fillStyle = 'rgba(116, 100, 84, 0.2)';
      // Head
      ctx.fillRect(32, 4, 32, 32);
      // Body
      ctx.fillRect(32, 36, 32, 48);
      // Arms
      ctx.fillRect(16, 36, 16, 48);
      ctx.fillRect(64, 36, 16, 48);
      // Legs
      ctx.fillRect(32, 84, 16, 48);
      ctx.fillRect(48, 84, 16, 48);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;

      const scale = 4;
      const armW = skinModel === 'slim' ? 3 : 4;
      const armPixelW = armW * scale;

      // 1. Head (Source: 8, 8, 8, 8)
      ctx.drawImage(img, 8, 8, 8, 8, 32, 4, 32, 32);

      // 2. Head Hat/Helm Overlay (Source: 40, 8, 8, 8)
      ctx.drawImage(img, 40, 8, 8, 8, 30, 2, 36, 36);

      // 3. Body (Source: 20, 20, 8, 12)
      ctx.drawImage(img, 20, 20, 8, 12, 32, 36, 32, 48);

      // 4. Right Arm (Source: 44, 20, armW, 12)
      ctx.drawImage(img, 44, 20, armW, 12, 32 - armPixelW, 36, armPixelW, 48);

      // 5. Left Arm
      if (img.height >= 64) {
        ctx.drawImage(img, 36, 52, armW, 12, 64, 36, armPixelW, 48);
      } else {
        // Legacy 64x32 mirror
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(img, 44, 20, armW, 12, -(64 + armPixelW), 36, armPixelW, 48);
        ctx.restore();
      }

      // 6. Right Leg (Source: 4, 20, 4, 12)
      ctx.drawImage(img, 4, 20, 4, 12, 32, 84, 16, 48);

      // 7. Left Leg
      if (img.height >= 64) {
        ctx.drawImage(img, 20, 52, 4, 12, 48, 84, 16, 48);
      } else {
        // Legacy 64x32 mirror
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(img, 4, 20, 4, 12, -64, 84, 16, 48);
        ctx.restore();
      }
    };
    img.src = skinDataUrl;
  }, [skinDataUrl, skinModel]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        imageRendering: 'pixelated',
        background: '#FAF4E8',
        border: '1.5px solid #D5C0A0',
        borderRadius: '6px',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
      }}
    />
  );
};
