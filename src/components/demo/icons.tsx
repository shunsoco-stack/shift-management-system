import type { SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "calendar"
  | "people"
  | "request"
  | "warning"
  | "settings"
  | "history"
  | "sparkles"
  | "check"
  | "chevron-right"
  | "chevron-left"
  | "clock"
  | "plus"
  | "trash"
  | "close"
  | "info"
  | "arrow-up-right"
  | "briefcase"
  | "publish"
  | "edit"
  | "refresh";

type IconProps = SVGProps<SVGSVGElement> & { name: IconName };

export function Icon({ name, ...props }: IconProps) {
  const content = (() => {
    switch (name) {
      case "dashboard":
        return <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>;
      case "calendar":
        return <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>;
      case "people":
        return <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>;
      case "request":
        return <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /><path d="m8 9 1 1 2-2" /></>;
      case "warning":
        return <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>;
      case "settings":
        return <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /></>;
      case "history":
        return <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>;
      case "sparkles":
        return <><path d="m12 3-1.2 3.3a2 2 0 0 1-1.2 1.2L6.3 8.7l3.3 1.2a2 2 0 0 1 1.2 1.2l1.2 3.3 1.2-3.3a2 2 0 0 1 1.2-1.2l3.3-1.2-3.3-1.2a2 2 0 0 1-1.2-1.2Z" /><path d="m5 15-.7 1.8a1 1 0 0 1-.6.6L2 18l1.7.6a1 1 0 0 1 .6.6L5 21l.7-1.8a1 1 0 0 1 .6-.6L8 18l-1.7-.6a1 1 0 0 1-.6-.6Z" /><path d="m19 14-.5 1.3a1 1 0 0 1-.6.6l-1.3.5 1.3.5a1 1 0 0 1 .6.6L19 19l.5-1.3a1 1 0 0 1 .6-.6l1.3-.5-1.3-.5a1 1 0 0 1-.6-.6Z" /></>;
      case "check":
        return <path d="m5 12 4 4L19 6" />;
      case "chevron-right":
        return <path d="m9 18 6-6-6-6" />;
      case "chevron-left":
        return <path d="m15 18-6-6 6-6" />;
      case "clock":
        return <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>;
      case "plus":
        return <path d="M12 5v14M5 12h14" />;
      case "trash":
        return <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" /></>;
      case "close":
        return <path d="m6 6 12 12M18 6 6 18" />;
      case "info":
        return <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>;
      case "arrow-up-right":
        return <><path d="M7 17 17 7M7 7h10v10" /></>;
      case "briefcase":
        return <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" /></>;
      case "publish":
        return <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></>;
      case "edit":
        return <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>;
      case "refresh":
        return <><path d="M20 6v5h-5M4 18v-5h5" /><path d="M18 9a7 7 0 0 0-12-3l-2 2M6 15a7 7 0 0 0 12 3l2-2" /></>;
    }
  })();

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {content}
    </svg>
  );
}

export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="demo-brand-mark"
      height={size}
      viewBox="0 0 48 48"
      width={size}
    >
      <rect width="48" height="48" rx="14" fill="url(#brand-gradient)" />
      <rect x="9.5" y="11" width="29" height="27" rx="7" fill="white" fillOpacity=".98" />
      <path d="M10 19.5h28" stroke="#0c806f" strokeWidth="2" />
      <path d="M17 8.5v6M31 8.5v6" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <circle cx="18" cy="27" r="4" fill="#97d8cb" />
      <circle cx="30.5" cy="27" r="4" fill="#0c806f" />
      <path d="M24.5 34.5a7 7 0 0 0 6-3.4" stroke="#0c806f" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 26.5v-5" stroke="white" strokeWidth="1.7" strokeLinecap="round" transform="translate(6.5)" />
      <defs>
        <linearGradient id="brand-gradient" x1="7" y1="5" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#13a08a" />
          <stop offset="1" stopColor="#05685d" />
        </linearGradient>
      </defs>
    </svg>
  );
}
