// The form's ID comes from NEXT_PUBLIC_ACTIVITY_FORM_ID (.env locally, the
// Vercel project's env vars when deployed) rather than being committed, so the
// public repo doesn't hand out a link to the real form. Read inside a function
// (Next inlines NEXT_PUBLIC_* at build time either way) so tests can stub it.
export function getActivityFormId(): string | null {
  return process.env.NEXT_PUBLIC_ACTIVITY_FORM_ID || null;
}

// Entry IDs scraped from the form's FB_PUBLIC_LOAD_DATA_ (활동 일지 폼).
// If the form is ever rebuilt/duplicated these will change and need re-scraping.

const ENTRY = {
  activityDate: "2095851707", // 1. 활동일자
  friendName: "976658623", // 2. 프렌즈명
  studentName: "2077271802", // 3. 학생명
  subject: "972659270", // 4. 과목명
  startTime: "1722084741", // 5-1. 활동 시작 시간
  endTime: "1248638839", // 5-2. 활동 종료 시간
  location: "547095163", // 6. 활동 장소
  mainContent: "691663253", // 8-1. 이번 주 활동한 주요 교육 내용
  evaluation: "583548806", // 8-2. 이번 주 활동에 대한 전반적 평가
  highlight: "1206986493", // 9. 가장 인상 깊었던 대화 혹은 활동
  gratitude: "1173902168", // 10. 활동 중 느낀 감사 혹은 기도 제목
} as const;

export interface ActivityFormPrefill {
  activityDate: string; // YYYY-MM-DD
  friendName: string;
  studentName: string;
  subject: string;
  startTime: string; // HH:mm (24h)
  endTime: string; // HH:mm (24h)
  location: string;
  mainContent: string;
  evaluation: string;
  highlight: string;
  gratitude: string;
}

/**
 * Builds a Google Forms "pre-filled" link. This only pre-fills answers —
 * nothing is submitted until the person opens the link and clicks 제출
 * themselves, so it's safe even if a value or the date/time format guess is
 * off (they'll just see an empty/wrong field to fix before submitting).
 * The self-rating questions (7-1~7-4) and optional ones (11, 12) are
 * intentionally left out for the person to answer in the form itself.
 * Returns null when no form ID is configured.
 */
export function buildActivityFormPrefillUrl(data: ActivityFormPrefill): string | null {
  const formId = getActivityFormId();
  if (!formId) return null;
  const params = new URLSearchParams({ usp: "pp_url" });
  const set = (key: keyof typeof ENTRY, value: string) => {
    if (value) params.set(`entry.${ENTRY[key]}`, value);
  };

  set("activityDate", data.activityDate);
  set("friendName", data.friendName);
  set("studentName", data.studentName);
  set("subject", data.subject);
  set("startTime", data.startTime);
  set("endTime", data.endTime);
  set("location", data.location);
  set("mainContent", data.mainContent);
  set("evaluation", data.evaluation);
  set("highlight", data.highlight);
  set("gratitude", data.gratitude);

  return `https://docs.google.com/forms/d/e/${formId}/viewform?${params.toString()}`;
}
