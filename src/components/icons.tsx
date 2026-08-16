// Inline SVG icons (Heroicons outline paths, 1.5 stroke) so glyph rendering
// is consistent across platforms and sizable via className.
interface IconProps {
  className?: string;
}

function Icon({ className = 'h-4 w-4', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 18 18 6M6 6l12 12" />
    </Icon>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </Icon>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </Icon>
  );
}

export function ArrowUpIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
    </Icon>
  );
}

export function ArrowDownIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
    </Icon>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </Icon>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </Icon>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 4.5v15m7.5-7.5h-15" />
    </Icon>
  );
}
