import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildActivityFormPrefillUrl } from "./google-form";

const FORM_ID = "test-form-id";

describe("buildActivityFormPrefillUrl", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_ACTIVITY_FORM_ID", FORM_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a pre-filled link with all provided fields as entry params", () => {
    const url = buildActivityFormPrefillUrl({
      activityDate: "2026-09-22",
      friendName: "교육 프렌즈",
      studentName: "홍길동",
      subject: "한국어",
      startTime: "18:30",
      endTime: "19:30",
      location: "학교 도서관",
      mainContent: "인사말 연습",
      evaluation: "적극적으로 참여함",
      highlight: "스스로 문장을 만들어 말함",
      gratitude: "",
    });

    expect(url?.startsWith(`https://docs.google.com/forms/d/e/${FORM_ID}/viewform?`)).toBe(true);

    const params = new URL(url!).searchParams;
    expect(params.get("entry.2095851707")).toBe("2026-09-22"); // 활동일자
    expect(params.get("entry.976658623")).toBe("교육 프렌즈"); // 프렌즈명
    expect(params.get("entry.2077271802")).toBe("홍길동"); // 학생명
    expect(params.get("entry.972659270")).toBe("한국어"); // 과목명
    expect(params.get("entry.1722084741")).toBe("18:30"); // 시작 시간
    expect(params.get("entry.1248638839")).toBe("19:30"); // 종료 시간
    expect(params.get("entry.547095163")).toBe("학교 도서관"); // 활동 장소
    expect(params.get("entry.691663253")).toBe("인사말 연습"); // 8-1
    expect(params.get("entry.583548806")).toBe("적극적으로 참여함"); // 8-2
    expect(params.get("entry.1206986493")).toBe("스스로 문장을 만들어 말함"); // 9
    expect(params.has("entry.1173902168")).toBe(false); // 10 gratitude, empty -> omitted
  });

  it("omits empty fields instead of sending blank entry params", () => {
    const url = buildActivityFormPrefillUrl({
      activityDate: "",
      friendName: "",
      studentName: "",
      subject: "",
      startTime: "",
      endTime: "",
      location: "",
      mainContent: "",
      evaluation: "",
      highlight: "",
      gratitude: "",
    });

    const params = new URL(url!).searchParams;
    // Only the constant `usp=pp_url` marker should be present.
    expect(Array.from(params.keys())).toEqual(["usp"]);
  });

  it("returns null when no form ID is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_ACTIVITY_FORM_ID", "");
    const url = buildActivityFormPrefillUrl({
      activityDate: "2026-09-22",
      friendName: "",
      studentName: "",
      subject: "",
      startTime: "",
      endTime: "",
      location: "",
      mainContent: "",
      evaluation: "",
      highlight: "",
      gratitude: "",
    });
    expect(url).toBeNull();
  });
});
