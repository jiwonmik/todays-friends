import { expect, test } from "@playwright/test";
import {
  FAKE_SPEECH_RECOGNITION_INIT_SCRIPT,
  type WindowWithFakeRecognitions,
} from "./fake-speech-recognition";

/** Fires a synthetic "final result" event on the most recently created fake recognizer. */
async function speakFinal(page: import("@playwright/test").Page, text: string) {
  await page.evaluate((spokenText) => {
    const recognitions = (window as unknown as WindowWithFakeRecognitions).__recognitions;
    const recognition = recognitions[recognitions.length - 1];
    const resultItem = { transcript: spokenText, confidence: 1 };
    const result = Object.assign([resultItem], { isFinal: true });
    const results = Object.assign([result], {});
    recognition.onresult?.({ resultIndex: 0, results });
  }, text);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(FAKE_SPEECH_RECOGNITION_INIT_SCRIPT);

  await page.route("**/api/translate", async (route) => {
    const body = route.request().postDataJSON() as { sourceLang: string };
    const translated = body.sourceLang === "ko-KR" ? "你好" : "안녕하세요, 선생님";
    await route.fulfill({ json: { translated } });
  });

  await page.route("**/api/summarize", async (route) => {
    await route.fulfill({
      json: {
        report: {
          mainContent: "오늘은 인사말과 자기소개 표현을 연습했습니다.",
          evaluation: "적극적으로 참여했습니다.",
          highlight: "학생이 스스로 문장을 만들어 말한 순간이 인상 깊었습니다.",
          gratitude: "",
        },
      },
    });
  });
});

test("full session: start, speak both languages, end with an editable report draft", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("한국어")).not.toBeVisible();
  await page.getByRole("button", { name: "시작하기" }).click();

  // Speak as the Korean side.
  await page.getByText("한국어").click();
  const koRecognitions = await page.evaluate(
    () => (window as unknown as WindowWithFakeRecognitions).__recognitions.length
  );
  expect(koRecognitions).toBeGreaterThan(0);
  await speakFinal(page, "안녕하세요");
  await expect(page.getByText("안녕하세요")).toBeVisible();
  await expect(page.getByText("你好")).toBeVisible();

  // Switch to the student's (Chinese) side.
  await page.getByText("中文").click();
  await speakFinal(page, "你好，老师");
  await expect(page.getByText("你好，老师")).toBeVisible();
  await expect(page.getByText("안녕하세요, 선생님")).toBeVisible();

  // End the session, then explicitly trigger report generation (it no
  // longer happens automatically), and confirm the draft renders/editable.
  await page.getByRole("button", { name: "종료하기" }).click();
  await page.getByText("활동 일지 생성하기").click();
  const mainContentField = page.getByLabel("8-1. 이번 주 활동한 주요 교육 내용");
  await expect(mainContentField).toHaveValue("오늘은 인사말과 자기소개 표현을 연습했습니다.");
  await expect(page.getByLabel("8-2. 이번 주 활동에 대한 전반적 평가")).toHaveValue(
    "적극적으로 참여했습니다."
  );
  await expect(page.getByText("활동일자")).toBeVisible();
  await expect(page.getByText("교육 프렌즈")).toBeVisible();

  await mainContentField.fill("수정된 내용");
  await expect(mainContentField).toHaveValue("수정된 내용");

  // The "구글폼 열기" link should reflect the (edited) draft as pre-fill params.
  await page.getByLabel("3. 학생명").fill("홍길동");
  await page.getByLabel("6. 활동 장소").fill("학교 도서관");
  const formLink = page.getByRole("link", { name: "구글폼 열기" });
  const href = await formLink.getAttribute("href");
  expect(href).toContain("docs.google.com/forms/d/e/");
  expect(href).toContain("entry.691663253=%EC%88%98%EC%A0%95%EB%90%9C+%EB%82%B4%EC%9A%A9"); // 8-1 = "수정된 내용"
  expect(href).toContain("entry.547095163=%ED%95%99%EA%B5%90+%EB%8F%84%EC%84%9C%EA%B4%80"); // 6. 활동 장소
  expect(href).toContain("entry.2077271802=%ED%99%8D%EA%B8%B8%EB%8F%99"); // 3. 학생명 = "홍길동"
});

test("only the active speaker's language is recognized", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "시작하기" }).click();

  await page.getByText("한국어").click();
  const lastLang = await page.evaluate(() => {
    const recognitions = (window as unknown as WindowWithFakeRecognitions).__recognitions;
    return recognitions[recognitions.length - 1].lang;
  });
  expect(lastLang).toBe("ko-KR");

  await page.getByText("中文").click();
  const lastLangAfterSwitch = await page.evaluate(() => {
    const recognitions = (window as unknown as WindowWithFakeRecognitions).__recognitions;
    return recognitions[recognitions.length - 1].lang;
  });
  expect(lastLangAfterSwitch).toBe("zh-CN");
});
