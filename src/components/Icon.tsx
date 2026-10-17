import type { CSSProperties } from 'react';

export type IconName =
  | 'cloud'
  | 'github'
  | 'arrow'
  | 'down'
  | 'sun'
  | 'sunset'
  | 'moon'
  | 'menu'
  | 'close'
  | 'mail'
  | 'copy'
  | 'check'
  | 'sparkles'
  | 'code'
  | 'book'
  | 'pen'
  | 'heart'
  | 'pin'
  | 'globe'
  | 'link'
  | 'headphones'
  | 'play'
  | 'pause'
  | 'share'
  | 'image'
  | 'text';

const paths: Record<IconName, React.ReactNode> = {
  cloud: <path d="M6 18a5 5 0 0 1-.8-9.94 7 7 0 0 1 13.12-.68A5.5 5.5 0 0 1 18.5 18Z" />,
  github: (
    <>
      <path
        d="M9 19c-4.3 1.3-4.3-2.2-6-2.7M15 22v-3.9c0-1.1-.1-1.7-.7-2.3 3.3-.4 6.7-1.6 6.7-7.3a5.7 5.7 0 0 0-1.5-4 5.3 5.3 0 0 0-.2-4s-1.3-.4-4.3 1.5a14.8 14.8 0 0 0-7 0C5 .1 3.7.5 3.7.5a5.3 5.3 0 0 0-.2 4A5.7 5.7 0 0 0 2 8.5c0 5.7 3.4 6.9 6.7 7.3-.5.5-.8 1.3-.7 2.3V22"
        transform="translate(1 1) scale(.9)"
      />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  down: <path d="M12 4v16m-6-6 6 6 6-6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
    </>
  ),
  sunset: <path d="M8 17a4 4 0 0 1 8 0M3 17h18M8 21h8M12 7v2M6.3 11.3 4.9 9.9m12.8 1.4 1.4-1.4" />,
  moon: <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  sparkles: (
    <>
      <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z" />
      <path d="m20 2 .7 1.3L22 4l-1.3.7L20 6l-.7-1.3L18 4l1.3-.7Z" />
    </>
  ),
  code: <path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" />,
  book: (
    <>
      <path d="M12 6c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v15" />
    </>
  ),
  pen: <path d="M4 20v-4L15 5a2.8 2.8 0 0 1 4 4L8 20Zm9.5-13.5 4 4M13 20h7" />,
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4.2 4.2 0 0 0 6 0l3.3-3.3a4.2 4.2 0 0 0-6-6L12 6" />
      <path d="M14 10a4.2 4.2 0 0 0-6 0l-3.3 3.3a4.2 4.2 0 0 0 6 6L12 18" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 18.5V13a8 8 0 0 1 16 0v5.5" />
      <rect x="4" y="14" width="4" height="6.5" rx="1.6" />
      <rect x="16" y="14" width="4" height="6.5" rx="1.6" />
    </>
  ),
  play: <path d="M7.5 5.2v13.6L19 12Z" />,
  pause: (
    <>
      <rect x="7" y="5.5" width="3.2" height="13" rx="1" />
      <rect x="13.8" y="5.5" width="3.2" height="13" rx="1" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V3M8 7l4-4 4 4" />
      <path d="M8 10H7a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-5a3 3 0 0 0-3-3h-1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="9.5" r="1.7" />
      <path d="m4 18 5-5 3.5 3.5L15 14l5 5" />
    </>
  ),
  // A large letter and a small one.
  text: (
    <path d="m2.5 19 5.5-14 5.5 14M4.6 14h6.8M15.5 19v-4.5a2.75 2.75 0 0 1 5.5 0V19m-5.5-2.5H21" />
  ),
};

export default function Icon({
  name,
  className = '',
  style,
}: {
  name: IconName;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={`icon ${className}`}
      style={style}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
