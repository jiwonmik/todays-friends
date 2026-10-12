"use client";

import type { RefObject } from "react";
import { syncScrollFades } from "@/lib/scroll-fades";
import type { TranscriptLine } from "@/lib/session-storage";
import { PersonIcon, TrashIcon } from "../icons";
import styles from "./TranscriptFeed.module.css";

interface TranscriptFeedProps {
  lines: TranscriptLine[];
  /** Report requested: the whole log is being reviewed, not followed live —
   *  every line gets the same full-ink treatment. */
  review: boolean;
  onDelete: (id: number) => void;
  feedRef: RefObject<HTMLDivElement | null>;
}

/** The scrollable conversation log — newest message at the bottom. */
export function TranscriptFeed({ lines, review, onDelete, feedRef }: TranscriptFeedProps) {
  return (
    <div
      className={review ? `${styles.feed} ${styles.feedReview}` : styles.feed}
      ref={feedRef}
      onScroll={(e) => syncScrollFades(e.currentTarget)}
    >
      {lines.map((line, index) => {
        const isKo = line.speaker === "나";
        return (
          <div
            key={line.id}
            className={`${styles.messageRow} ${isKo ? styles.messageRowKo : styles.messageRowZh}`}
          >
            <div className={isKo ? styles.avatarKo : styles.avatarZh} aria-hidden="true">
              <PersonIcon />
            </div>
            <div className={index === lines.length - 1 ? styles.messageLatest : styles.messageOlder}>
              <div className={styles.messageOriginal}>{line.original}</div>
              <div className={styles.messageTranslated}>
                {line.translating ? "번역 중..." : line.translated}
              </div>
            </div>
            {/* On the message's open side (right of "나", left of "학생"
                via the row's direction); the delete button only shows
                while the line is hovered. */}
            <div className={styles.messageDeleteGutter}>
              <button
                type="button"
                className={styles.messageDeleteButton}
                onClick={() => onDelete(line.id)}
                aria-label="메시지 삭제"
                title="메시지 삭제"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
