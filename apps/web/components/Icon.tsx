const ICONS: Record<string, string> = {
  home: '<path d="M3 10.5 10 4l7 6.5"/><path d="M5.5 9v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9"/><path d="M8 17v-4h4v4"/>',
  gamepad: '<rect x="2" y="7" width="16" height="8" rx="4"/><path d="M6 9.5v3M4.5 11h3"/><circle cx="14" cy="9.3" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="11.3" r="1" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M6 3h8v4a4 4 0 0 1-8 0V3z"/><path d="M6 4H3.5A1.5 1.5 0 0 0 2 5.5 3.5 3.5 0 0 0 5.5 9H6"/><path d="M14 4h2.5A1.5 1.5 0 0 1 18 5.5 3.5 3.5 0 0 1 14.5 9H14"/><path d="M10 11v3"/><path d="M7 17h6"/><path d="M8 17c0-1.5.7-2.2 2-3 1.3.8 2 1.5 2 3"/>',
  settings: '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7"/>',
  barchart: '<path d="M3 17h14"/><path d="M5.5 16V10M10 16V4M14.5 16v-6"/>',
  bell: '<path d="M10 3a4 4 0 0 0-4 4v2.3c0 1-.4 2-1.1 2.7L4 13h12l-.9-1c-.7-.7-1.1-1.7-1.1-2.7V7a4 4 0 0 0-4-4z"/><path d="M8 16a2 2 0 0 0 4 0"/>',
  search: '<circle cx="8.5" cy="8.5" r="5"/><path d="M17 17l-4.5-4.5"/>',
  x: '<path d="M5 5l10 10M15 5 5 15"/>',
  check: '<path d="M4 10.5l3.5 3.5L16 5.5"/>',
  chevleft: '<path d="M12.5 4.5 6 10l6.5 5.5"/>',
  chevright: '<path d="M7.5 4.5 14 10l-6.5 5.5"/>',
  alert: '<path d="M10 3 18 16H2L10 3z"/><path d="M10 8.5v3.5"/><circle cx="10" cy="14" r="0.9" fill="currentColor" stroke="none"/>',
  trendup: '<path d="M3 14l5-5 3 3 6-7"/><path d="M13 5h4v4"/>',
  minuscircle: '<circle cx="10" cy="10" r="7"/><path d="M6.5 10h7"/>',
  userplus: '<circle cx="8" cy="7" r="3"/><path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M15.5 6v4M13.5 8h4"/>',
  brain: '<path d="M8 3.5c-2 0-3.5 1.5-3.5 3.2 0 .6.2 1.2.5 1.7-1 .5-1.7 1.6-1.7 2.8 0 1.4 1 2.6 2.4 2.9.1 1.6 1.4 2.9 3.1 2.9h.2V3.5H8z"/><path d="M12 3.5c2 0 3.5 1.5 3.5 3.2 0 .6-.2 1.2-.5 1.7 1 .5 1.7 1.6 1.7 2.8 0 1.4-1 2.6-2.4 2.9-.1 1.6-1.4 2.9-3.1 2.9h-.2V3.5H12z"/>',
  target: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r="1" fill="currentColor" stroke="none"/>',
  bolt: '<path d="M11 2 4 12h5l-1 6 8-11h-5l1-5z" fill="currentColor" stroke="none"/>',
  compass: '<circle cx="10" cy="10" r="7.5"/><path d="M13 7l-2 5-4 1 2-5 4-1z" fill="currentColor" stroke="none"/>',
  message: '<path d="M3 10a7 7 0 1 1 3.5 6.1L3 17l1-3.4A7 7 0 0 1 3 10z"/>',
  smile: '<circle cx="10" cy="10" r="7.5"/><circle cx="7.2" cy="8.5" r="1" fill="currentColor" stroke="none"/><circle cx="12.8" cy="8.5" r="1" fill="currentColor" stroke="none"/><path d="M6.5 12c1 1.4 2.3 2 3.5 2s2.5-.6 3.5-2"/>',
  bulb: '<path d="M10 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2v.5h4V14c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z"/><path d="M8.3 17h3.4M9 15.5h2"/>',
  clock: '<circle cx="10" cy="10" r="7.5"/><path d="M10 6v4l3 2"/>',
  download: '<path d="M10 3v9M6.5 9 10 12.5 13.5 9"/><path d="M4 15.5h12v1.5H4z" fill="currentColor" stroke="none"/>',
  lock: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9"/>',
  mail: '<rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><path d="M3 5.5l7 5.5 7-5.5"/>',
  eye: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.3"/>',
  eyeoff: '<path d="M4 4l12 12"/><path d="M8.3 5.4A8.9 8.9 0 0 1 10 5.2c5 0 8 4.8 8 4.8a13 13 0 0 1-3 3.3M6.1 6.8A12.9 12.9 0 0 0 2 10s3 4.8 8 4.8c1 0 1.9-.15 2.8-.4"/><path d="M8.2 8.2a2.3 2.3 0 0 0 3.2 3.2"/>',
  logout: '<path d="M8 4H4.5A1.5 1.5 0 0 0 3 5.5v9A1.5 1.5 0 0 0 4.5 16H8"/><path d="M12.5 6.5 16 10l-3.5 3.5"/><path d="M16 10H8"/>',
  flame: '<path d="M10 2.2c.4 2.1 1.7 3.5 2.9 4.9 1.3 1.6 2.1 3 2.1 4.6a5 5 0 0 1-10 0c0-1.8.9-3.2 1.9-4.3.1 1.8.9 2.7 1.7 2.7.9 0 1.4-1 1-2.1-.4-1.2-1.2-2.3.4-5.8z" fill="currentColor" stroke="none" fill-rule="evenodd"/>',
  star: '<path d="M10 2.5l2.2 4.6 5 .6-3.7 3.5.9 5-4.4-2.5-4.4 2.5.9-5-3.7-3.5 5-.6L10 2.5z"/>',
  leaf: '<path d="M4 16c0-7 4-11 12-11 0 8-4 12-11 12-.5 0-1 0-1-.3z"/><path d="M5.5 14.5 11 9"/>',
  crown: '<path d="M3 15h14l-1-7-3.5 3-2.5-5-2.5 5L4 8l-1 7z"/>',
  wrench: '<path d="M13.5 3.5a3.5 3.5 0 0 0-4.6 4.2L3 13.6V17h3.4l5.9-5.9a3.5 3.5 0 0 0 4.2-4.6l-2.5 2.5-1.6-1.6 2.5-2.5z"/>',
  sparkle: '<path d="M6 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="currentColor" stroke="none"/><path d="M14 9l1.2 3 3 1.2-3 1.2L14 17l-1.2-2.6-3-1.2 3-1.2z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  pulse: '<path d="M2 10h3l2-5 3 10 2-5h6"/>',
};

interface IconProps { name: string; size?: number; color?: string; className?: string }

/** Port of the HTML icon(): stroke icon on a 20x20 viewBox. */
export function Icon({ name, size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      className={'icon' + (className ? ' ' + className : '')}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }}
    />
  );
}
