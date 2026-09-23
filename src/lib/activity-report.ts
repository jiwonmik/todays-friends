export interface ActivityReportDraft {
  mainContent: string; // 8-1. 이번 주 활동한 주요 교육 내용
  evaluation: string; // 8-2. 이번 주 활동에 대한 전반적 평가
  highlight: string; // 9. 가장 인상 깊었던 대화 혹은 활동
  gratitude: string; // 10. 활동 중 느낀 감사 혹은 기도 제목 (대화에 없으면 빈 문자열)
}

export const EMPTY_ACTIVITY_REPORT: ActivityReportDraft = {
  mainContent: "",
  evaluation: "",
  highlight: "",
  gratitude: "",
};

// 매 세션 동일한 고정값 — 폼에 함께 제출되는 정보. 학생명은 개인정보라
// 코드에 두지 않고 화면에서 입력받는다 (src/lib/session-storage.ts 참고).
export const ACTIVITY_FRIEND_NAME = "교육 프렌즈";
export const ACTIVITY_SUBJECT_NAME = "한국어";
