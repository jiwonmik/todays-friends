import styles from "./PageTitle.module.css";

interface PageTitleProps {
  /**
   * "center" — dead center of the screen, large (the idle/first screen
   * only). "top" — pinned near the top edge with margin, smaller (every
   * other screen: active session, session ended).
   */
  position: "center" | "top";
}

/**
 * The page's title, split out as its own region so its position is never
 * entangled with the header's own layout, which changes across the
 * idle/active/ended screens.
 */
export function PageTitle({ position }: PageTitleProps) {
  return (
    <h1 className={position === "center" ? styles.titleCenter : styles.titleTop}>
      Today&apos;s <em>Friends Time</em>
    </h1>
  );
}
