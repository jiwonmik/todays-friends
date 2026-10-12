import {
  ACTIVITY_FRIEND_NAME,
  ACTIVITY_SUBJECT_NAME,
  type ActivityReportDraft,
} from "@/lib/activity-report";
import { formatActivityDate, formatActivityTime } from "@/lib/datetime";
import { buildActivityFormPrefillUrl } from "@/lib/google-form";
import { Button } from "../Button";
import styles from "./ActivityReportForm.module.css";

interface ActivityReportFormProps {
  report: ActivityReportDraft;
  sessionStartAt: Date | null;
  sessionEndAt: Date | null;
  studentName: string;
  location: string;
  onStudentNameChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onFieldChange: (field: keyof ActivityReportDraft, value: string) => void;
}

/** The editable activity-log draft and the link that opens it in the Google Form. */
export function ActivityReportForm({
  report,
  sessionStartAt,
  sessionEndAt,
  studentName,
  location,
  onStudentNameChange,
  onLocationChange,
  onFieldChange,
}: ActivityReportFormProps) {
  // Pre-filled link to the activity-log Google Form, or null when no form ID
  // is configured (see getActivityFormId).
  const activityFormUrl = buildActivityFormPrefillUrl({
    activityDate: sessionStartAt ? formatActivityDate(sessionStartAt) : "",
    friendName: ACTIVITY_FRIEND_NAME,
    studentName,
    subject: ACTIVITY_SUBJECT_NAME,
    startTime: sessionStartAt ? formatActivityTime(sessionStartAt) : "",
    endTime: sessionEndAt ? formatActivityTime(sessionEndAt) : "",
    location,
    mainContent: report.mainContent,
    evaluation: report.evaluation,
    highlight: report.highlight,
    gratitude: report.gratitude,
  });

  return (
    <div className={styles.summaryBox}>
      <h2>활동 일지 초안</h2>
      <p className={styles.reportHint}>
        아래는 AI가 대화 내용을 바탕으로 작성한 초안이에요. 제출 전에 확인하고 자유롭게 수정해주세요.
      </p>

      <div className={styles.reportMeta}>
        <div>
          <span className={styles.reportMetaLabel}>활동일자</span>
          {sessionStartAt ? formatActivityDate(sessionStartAt) : "-"}
        </div>
        <div>
          <span className={styles.reportMetaLabel}>시작 · 종료 시간</span>
          {sessionStartAt ? formatActivityTime(sessionStartAt) : "-"} ~{" "}
          {sessionEndAt ? formatActivityTime(sessionEndAt) : "-"}
        </div>
        <div>
          <span className={styles.reportMetaLabel}>프렌즈명</span>
          {ACTIVITY_FRIEND_NAME}
        </div>
        <div>
          <span className={styles.reportMetaLabel}>과목명</span>
          {ACTIVITY_SUBJECT_NAME}
        </div>
      </div>

      <div className={styles.reportField}>
        <label htmlFor="studentName">3. 학생명</label>
        <input
          id="studentName"
          type="text"
          value={studentName}
          onChange={(e) => onStudentNameChange(e.target.value)}
          placeholder="학생 이름"
        />
      </div>

      <div className={styles.reportField}>
        <label htmlFor="location">6. 활동 장소</label>
        <input
          id="location"
          type="text"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          placeholder="예: 학교 도서관"
        />
      </div>

      <div className={styles.reportField}>
        <label htmlFor="mainContent">8-1. 이번 주 활동한 주요 교육 내용</label>
        <textarea
          id="mainContent"
          value={report.mainContent}
          onChange={(e) => onFieldChange("mainContent", e.target.value)}
        />
      </div>

      <div className={styles.reportField}>
        <label htmlFor="evaluation">8-2. 이번 주 활동에 대한 전반적 평가</label>
        <textarea
          id="evaluation"
          value={report.evaluation}
          onChange={(e) => onFieldChange("evaluation", e.target.value)}
        />
      </div>

      <div className={styles.reportField}>
        <label htmlFor="highlight">9. 가장 인상 깊었던 대화 혹은 활동</label>
        <textarea
          id="highlight"
          value={report.highlight}
          onChange={(e) => onFieldChange("highlight", e.target.value)}
        />
      </div>

      <div className={styles.reportField}>
        <label htmlFor="gratitude">10. 활동 중 느낀 감사 혹은 기도 제목</label>
        <textarea
          id="gratitude"
          value={report.gratitude}
          onChange={(e) => onFieldChange("gratitude", e.target.value)}
          placeholder="대화에서 특별히 드러나지 않아 비워뒀어요. 직접 작성해주세요."
        />
      </div>

      {activityFormUrl ? (
        <>
          <Button
            href={activityFormUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.formLinkButton}
          >
            구글폼 열기
          </Button>
          <p className={styles.reportHint}>
            새 탭에서 폼이 열리고 위 내용이 채워져 있을 거예요. 자기평가 항목(7번)은 직접 선택하고, 확인 후 제출 버튼을 눌러주세요.
          </p>
        </>
      ) : (
        <p className={styles.reportHint}>
          구글폼 주소가 설정되지 않았어요. 환경변수 NEXT_PUBLIC_ACTIVITY_FORM_ID를 확인해주세요.
        </p>
      )}
    </div>
  );
}
