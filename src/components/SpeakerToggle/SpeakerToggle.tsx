import type { HTMLAttributes } from "react";
import type { Speaker } from "@/lib/speaker";
import { Button } from "../Button";
import styles from "./SpeakerToggle.module.css";

type SpeakerToggleProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "onChange"> & {
  speaker: Speaker;
  connecting: boolean;
  /** Switching is blocked mid-utterance and while a line is translating. */
  locked: boolean;
  onChange: (speaker: Speaker) => void;
};

/** 한국어 / 中文 picker — pressing the active language again deselects it. */
export function SpeakerToggle({
  speaker,
  connecting,
  locked,
  onChange,
  className,
  ...props
}: SpeakerToggleProps) {
  return (
    <div className={className ? `${styles.speakerToggle} ${className}` : styles.speakerToggle} {...props}>
      <Button
        variant={speaker !== "ko" ? "toggle" : connecting ? "pending" : "toggleKo"}
        onClick={() => onChange(speaker === "ko" ? null : "ko")}
        disabled={locked}
      >
        한국어
        {speaker === "ko" && connecting && (
          <span className={styles.pendingHint}> · 마이크 연결 중...</span>
        )}
      </Button>
      <Button
        variant={speaker !== "zh" ? "toggle" : connecting ? "pending" : "toggleZh"}
        onClick={() => onChange(speaker === "zh" ? null : "zh")}
        disabled={locked}
      >
        中文
        {speaker === "zh" && connecting && (
          <span className={styles.pendingHint}> · 마이크 연결 중...</span>
        )}
      </Button>
    </div>
  );
}
