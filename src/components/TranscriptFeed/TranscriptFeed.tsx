"use client";

import { useState, type KeyboardEvent, type RefObject } from "react";
import { syncScrollFades } from "@/lib/scroll-fades";
import type { TranscriptLine } from "@/lib/session-storage";
import { CheckIcon, CloseIcon, PencilIcon, PersonIcon, TrashIcon } from "../icons";
import styles from "./TranscriptFeed.module.css";

interface TranscriptFeedProps {
  lines: TranscriptLine[];
  /** Report requested: the whole log is being reviewed, not followed live —
   *  every line gets the same full-ink treatment. */
  review: boolean;
  onDelete: (id: number) => void;
  /** Called with the new original text; the line is translated again. */
  onEdit: (id: number, text: string) => void;
  feedRef: RefObject<HTMLDivElement | null>;
}

/** The message being edited in place, and what's typed so far. */
interface LineEdit {
  id: number;
  draft: string;
}

/** The scrollable conversation log — newest message at the bottom. */
export function TranscriptFeed({ lines, review, onDelete, onEdit, feedRef }: TranscriptFeedProps) {
  const [editing, setEditing] = useState<LineEdit | null>(null);

  const saveEdit = () => {
    if (!editing || !editing.draft.trim()) return;
    onEdit(editing.id, editing.draft);
    setEditing(null);
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an IME is composing (Korean/Chinese input) confirms the
    // characters being typed, not the edit.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      setEditing(null);
    }
  };

  return (
    <div
      className={review ? `${styles.feed} ${styles.feedReview}` : styles.feed}
      ref={feedRef}
      onScroll={(e) => syncScrollFades(e.currentTarget)}
    >
      {lines.map((line, index) => {
        const isKo = line.speaker === "나";
        const isEditing = editing?.id === line.id;
        const emphasis = index === lines.length - 1 ? styles.messageLatest : styles.messageOlder;
        return (
          <div
            key={line.id}
            className={`${styles.messageRow} ${isKo ? styles.messageRowKo : styles.messageRowZh}`}
          >
            <div className={isKo ? styles.avatarKo : styles.avatarZh} aria-hidden="true">
              <PersonIcon />
            </div>
            <div className={isEditing ? `${emphasis} ${styles.messageEditing}` : emphasis}>
              {isEditing ? (
                <textarea
                  className={styles.messageEditInput}
                  value={editing.draft}
                  onChange={(e) => setEditing({ id: line.id, draft: e.target.value })}
                  onKeyDown={handleEditKeyDown}
                  aria-label="메시지 수정"
                  rows={1}
                  autoFocus
                />
              ) : (
                <div className={styles.messageOriginal}>{line.original}</div>
              )}
              <div className={styles.messageTranslated}>
                {line.translating ? "번역 중..." : line.translated}
              </div>
            </div>
            {/* On the message's open side (right of "나", left of "학생"
                via the row's direction); the edit/delete buttons only show
                while the line is hovered, save/cancel for as long as it's
                being edited. */}
            <div className={styles.messageActions}>
              {isEditing ? (
                <>
                  <button
                    type="button"
                    className={`${styles.messageActionButton} ${styles.messageActionPinned}`}
                    onClick={saveEdit}
                    disabled={!editing.draft.trim()}
                    aria-label="수정 완료"
                    title="수정 완료"
                  >
                    <CheckIcon />
                  </button>
                  <button
                    type="button"
                    className={`${styles.messageActionButton} ${styles.messageActionPinned}`}
                    onClick={() => setEditing(null)}
                    aria-label="수정 취소"
                    title="수정 취소"
                  >
                    <CloseIcon />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.messageActionButton}
                    onClick={() => setEditing({ id: line.id, draft: line.original })}
                    aria-label="메시지 수정"
                    title="메시지 수정"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    className={`${styles.messageActionButton} ${styles.messageDeleteButton}`}
                    onClick={() => onDelete(line.id)}
                    aria-label="메시지 삭제"
                    title="메시지 삭제"
                  >
                    <TrashIcon />
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
