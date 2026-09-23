import type { ButtonHTMLAttributes } from "react";
import { Button } from "./Button";
import styles from "./EndSessionButton.module.css";

function StopIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

type EndSessionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onEnd: () => void;
};

/**
 * Ends the whole session. Its own fixed control (bottom-right corner), kept
 * apart from the voice orb, which handles the per-utterance "translate now"
 * action instead.
 */
export function EndSessionButton({ onEnd, className, ...props }: EndSessionButtonProps) {
  return (
    <Button
      variant="danger"
      size="icon"
      className={className ? `${styles.fab} ${className}` : styles.fab}
      onClick={onEnd}
      aria-label="종료하기"
      {...props}
    >
      <StopIcon />
    </Button>
  );
}
