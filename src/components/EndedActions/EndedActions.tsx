import type { HTMLAttributes } from "react";
import { Button } from "../Button";
import { DocumentIcon, RestartIcon, ResumeIcon } from "../icons";
import styles from "./EndedActions.module.css";

type EndedActionsProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** 활동 일지 생성하기 is hidden (not removed) once a draft is generating
   *  or done — it keeps its slot so the row under it never shifts. */
  reportTriggerHidden: boolean;
  summarizing: boolean;
  onGenerateReport: () => void;
  onResume: () => void;
  onRestart: () => void;
};

/** Controls shown once a session has ended. */
export function EndedActions({
  reportTriggerHidden,
  summarizing,
  onGenerateReport,
  onResume,
  onRestart,
  className,
  ...props
}: EndedActionsProps) {
  return (
    <div className={className ? `${styles.endedActions} ${className}` : styles.endedActions} {...props}>
      <Button
        className={
          reportTriggerHidden
            ? `${styles.iconLabelButton} ${styles.reportTrigger} ${styles.reportTriggerHidden}`
            : `${styles.iconLabelButton} ${styles.reportTrigger}`
        }
        onClick={onGenerateReport}
        inert={reportTriggerHidden}
        aria-hidden={reportTriggerHidden || undefined}
      >
        <DocumentIcon />
        활동 일지 생성하기
      </Button>
      <div className={styles.endedActionsRow}>
        <Button className={styles.iconLabelButton} onClick={onResume}>
          <ResumeIcon size={18} />
          이어서 하기
        </Button>
        <Button
          className={styles.iconLabelButton}
          onClick={onRestart}
          // Disabled (not hidden) while a report is generating, so
          // starting over can't wipe the session out from under the
          // in-flight request — 이어서 하기 stays available and cancels it.
          disabled={summarizing}
        >
          <RestartIcon />
          새로 시작
        </Button>
      </div>
    </div>
  );
}
