import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  fullWidth?: boolean;
  tone?: "primary" | "secondary" | "purple" | "text";
}

export function Button({
  children,
  className = "",
  fullWidth = false,
  tone = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "button",
    `button--${tone}`,
    fullWidth ? "button--full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} type={type} {...props}>
      {children}
    </button>
  );
}
