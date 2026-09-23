"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "danger" | "toggle" | "toggleKo" | "toggleZh" | "pending";
export type ButtonSize = "md" | "lg" | "icon" | "iconLg";

interface SharedProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
}

type AsButton = SharedProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type AsAnchor = SharedProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

export type ButtonProps = AsButton | AsAnchor;

/**
 * Shared pill button used for every button on the session screen (session
 * start/end, speaker toggle, report actions). Renders as an `<a>` when
 * `href` is passed, otherwise a `<button>` — same shape/style either way.
 */
export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");

  if (props.href !== undefined) {
    return <a className={classes} {...(props as AsAnchor)} />;
  }

  return <button className={classes} {...(props as AsButton)} />;
}
