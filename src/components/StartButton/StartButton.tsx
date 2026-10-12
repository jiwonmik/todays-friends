import type { HTMLAttributes } from "react";
import { Button } from "../Button";
import { PlayIcon } from "../icons";
import styles from "./StartButton.module.css";

type StartButtonProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  onStart: () => void;
};

/** The idle screen's big "시작하기" button, with its hover ripples. */
export function StartButton({ onStart, className, ...props }: StartButtonProps) {
  return (
    <div
      className={className ? `${styles.heroStartButtonFixed} ${className}` : styles.heroStartButtonFixed}
      {...props}
    >
      <span className={styles.ripple} aria-hidden="true" />
      <span className={styles.ripple} aria-hidden="true" />
      <span className={styles.ripple} aria-hidden="true" />
      <Button
        size="iconLg"
        className={styles.heroStartButton}
        onClick={onStart}
        aria-label="시작하기"
      >
        <PlayIcon size={34} />
      </Button>
    </div>
  );
}
