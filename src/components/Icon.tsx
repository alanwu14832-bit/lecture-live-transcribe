/**
 * 圖示統一走 Phosphor（regular 線條），不再手畫 SVG。
 * 對外仍是 name 介面，呼叫端不用知道圖示庫；圖示本身不帶語意，按鈕要自己給 aria-label。
 */
import type { ComponentType } from "react";
import {
  ArrowDown, ArrowLeft, ArrowsClockwise, BookmarkSimple, BookOpen, CaretDown, Check, Clock, Copy, DotsThree,
  DownloadSimple, Info, MagnifyingGlass, Microphone, Moon, Pause, PencilSimple, Play, Plus, SidebarSimple, Sliders,
  Stop, Sun, TextT, Translate, Trash, Warning, WifiSlash, X, type IconProps as PhosphorProps,
} from "@phosphor-icons/react";

const ICONS = {
  mic: Microphone,
  pause: Pause,
  play: Play,
  stop: Stop,
  search: MagnifyingGlass,
  notes: SidebarSimple,
  more: DotsThree,
  back: ArrowLeft,
  bookmark: BookmarkSimple,
  copy: Copy,
  edit: PencilSimple,
  check: Check,
  x: X,
  chevronDown: CaretDown,
  download: DownloadSimple,
  trash: Trash,
  plus: Plus,
  alert: Warning,
  info: Info,
  sun: Sun,
  moon: Moon,
  refresh: ArrowsClockwise,
  translate: Translate,
  arrowDown: ArrowDown,
  wifiOff: WifiSlash,
  text: TextT,
  settings: Sliders,
  clock: Clock,
  book: BookOpen,
} satisfies Record<string, ComponentType<PhosphorProps>>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, weight = "regular", className, ...rest }: { name: IconName; size?: number; className?: string } & Omit<PhosphorProps, "size" | "className">) {
  const Cmp = ICONS[name];
  return <Cmp size={size} weight={weight} className={className} aria-hidden="true" focusable="false" {...rest} />;
}
