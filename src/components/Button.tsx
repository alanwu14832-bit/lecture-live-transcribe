import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "recording";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white hover:opacity-90 disabled:opacity-50",
  secondary: "bg-surface text-primary border border-border hover:bg-surface-2 disabled:opacity-50",
  ghost: "bg-transparent text-primary hover:bg-surface-2 disabled:opacity-50",
  danger: "bg-surface text-recording border border-border hover:bg-recording-soft disabled:opacity-50",
  recording: "bg-recording text-white hover:opacity-90 disabled:opacity-50",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13px] gap-1.5",
  md: "h-10 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  /** 純圖示按鈕：一定要給 aria-label */
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconOnly, className = "", children, type = "button", ...rest },
  ref,
) {
  const square = iconOnly ? (size === "sm" ? "w-8 px-0" : size === "lg" ? "w-11 px-0" : "w-10 px-0") : "";
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap select-none transition-colors duration-150 ${VARIANT[variant]} ${SIZE[size]} ${square} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {!iconOnly && children}
    </button>
  );
});
