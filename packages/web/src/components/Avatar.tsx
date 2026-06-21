interface AvatarProps {
  mcUsername?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ mcUsername, size = 32, className }: AvatarProps) {
  const src = mcUsername
    ? `/api/avatars/${encodeURIComponent(mcUsername)}`
    : `/api/avatars/__steve__`;

  return (
    <img
      src={src}
      alt={mcUsername ?? "Player"}
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: "pixelated", borderRadius: 4 }}
    />
  );
}
