/**
 * 內嵌 SVG 圖示。全部 24 格、線條式，顏色跟著文字。
 * 圖示本身不帶語意，按鈕要自己給 aria-label。
 */
import type { SVGProps } from "react";

const PATHS = {
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8",
  pause: "M8 5v14M16 5v14",
  play: "M7 4l12 8-12 8z",
  stop: "M6 6h12v12H6z",
  search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4",
  notes: "M4 5h16v14H4zM15 5v14",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  back: "M15 5l-7 7 7 7",
  bookmark: "M7 4h10v16l-5-4-5 4z",
  copy: "M9 9h10v11H9zM5 15V4h10",
  edit: "M4 20h4l11-11-4-4L4 16zM13 7l4 4",
  check: "M5 12l5 5 9-10",
  x: "M6 6l12 12M18 6L6 18",
  chevronDown: "M6 9l6 6 6-6",
  download: "M12 4v12M6 11l6 6 6-6M4 20h16",
  trash: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
  plus: "M12 5v14M5 12h14",
  alert: "M12 4l9 16H3zM12 10v4M12 17.5v.5",
  info: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 11v5M12 8v.5",
  sun: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  refresh: "M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5",
  translate: "M4 5h9M8.5 3v2M11 5c-.8 4-3.5 7.5-7 9M6 8c1 2.5 3 4.5 5.5 6M13 20l4.5-11L22 20M14.5 16h6",
  arrowDown: "M12 5v14M6 13l6 6 6-6",
  wifiOff: "M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01M3 3l18 18",
  text: "M5 7V5h14v2M12 5v14M9 19h6",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6",
  clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7v5l3 2",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
