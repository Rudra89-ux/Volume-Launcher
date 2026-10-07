import React from 'react';

export const PROFILE_ICONS: { id: string; label: string; symbol: string }[] = [
  { id: 'moon', label: 'Moon', symbol: '🌙' },
  { id: 'star', label: 'Star', symbol: '⭐' },
  { id: 'sun', label: 'Sun', symbol: '☀️' },
  { id: 'flame', label: 'Flame', symbol: '🔥' },
  { id: 'leaf', label: 'Leaf', symbol: '🍃' },
  { id: 'sword', label: 'Sword', symbol: '⚔️' },
];

export function getProfileIconSymbol(iconId?: string): string {
  if (!iconId) return '🌙';
  const found = PROFILE_ICONS.find(i => i.id === iconId || i.symbol === iconId);
  return found ? found.symbol : (iconId.length <= 2 ? iconId : '🌙');
}

interface ExplorerAvatarProps {
  username: string;
  uuid?: string;
  size?: number;
  className?: string;
  avatarType?: 'default' | 'custom' | 'skin';
  avatarPath?: string;
  profileIcon?: string;
}

// Earthy Minecraft color palettes
const AVATAR_PALETTES = [
  { bg: 'linear-gradient(135deg, #788B55 0%, #526B45 100%)', border: '#9EB375', text: '#FAF4E8' }, // Forest & Moss
  { bg: 'linear-gradient(135deg, #C8A878 0%, #A68054 100%)', border: '#E2CCA6', text: '#2A1A0F' }, // Light Wood
  { bg: 'linear-gradient(135deg, #CA7F62 0%, #B86F52 100%)', border: '#DDB09C', text: '#FAF4E8' }, // Terracotta
  { bg: 'linear-gradient(135deg, #648256 0%, #3F5938 100%)', border: '#8DA266', text: '#FAF4E8' }, // Deep Pines
  { bg: 'linear-gradient(135deg, #B89468 0%, #7C5C36 100%)', border: '#D5C0A0', text: '#FAF4E8' }, // Weathered Oak
  { bg: 'linear-gradient(135deg, #8C7863 0%, #5E4E3D 100%)', border: '#B8A58A', text: '#FAF4E8' }, // Mountain Stone
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export const ExplorerAvatar: React.FC<ExplorerAvatarProps> = ({
  username,
  uuid,
  size = 28,
  className = '',
  avatarType = 'default',
  avatarPath,
  profileIcon = 'moon',
}) => {
  const seed = uuid || username || 'Player';
  const paletteIndex = Math.abs(hashString(seed)) % AVATAR_PALETTES.length;
  const palette = AVATAR_PALETTES[paletteIndex] || AVATAR_PALETTES[0];
  const iconSymbol = getProfileIconSymbol(profileIcon) || '🌙';

  // If a custom or skin avatar image exists, display it with an optional corner icon
  if (avatarPath && (avatarType === 'custom' || avatarType === 'skin')) {
    return (
      <div
        className={`explorer-avatar-badge ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          minWidth: `${size}px`,
          minHeight: `${size}px`,
          borderRadius: size > 40 ? '6px' : '4px',
          border: `1.5px solid ${palette.border}`,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)',
          flexShrink: 0,
          background: '#2A1A0F',
          position: 'relative',
        }}
        title={`Profile: ${username} (${iconSymbol})`}
      >
        <img
          src={avatarPath}
          alt={username}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            imageRendering: 'pixelated',
          }}
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        {size >= 32 && (
          <span
            style={{
              position: 'absolute',
              bottom: '1px',
              right: '2px',
              fontSize: `${Math.max(9, Math.round(size * 0.28))}px`,
              lineHeight: 1,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
            }}
          >
            {iconSymbol}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`explorer-avatar-badge ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        borderRadius: size > 40 ? '6px' : '4px',
        background: palette.bg,
        border: `1.5px solid ${palette.border}`,
        color: palette.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-heading)',
        fontWeight: 800,
        fontSize: `${Math.round(size * 0.52)}px`,
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)',
        userSelect: 'none',
        flexShrink: 0,
      }}
      title={`Profile: ${username} (${iconSymbol})`}
    >
      <span role="img" aria-label={profileIcon || 'icon'} style={{ lineHeight: 1 }}>
        {iconSymbol}
      </span>
    </div>
  );
};
