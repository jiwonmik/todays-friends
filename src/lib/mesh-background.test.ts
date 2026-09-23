import { describe, expect, it } from "vitest";
import { generateDailyMeshTheme, INITIAL_MESH_THEME } from "./mesh-background";

describe("generateDailyMeshTheme", () => {
  it("is deterministic for the same calendar day", () => {
    const morning = new Date("2026-09-22T01:00:00Z");
    const night = new Date("2026-09-22T23:00:00Z");

    expect(generateDailyMeshTheme(morning)).toEqual(generateDailyMeshTheme(night));
  });

  it("changes on a different calendar day", () => {
    const today = generateDailyMeshTheme(new Date("2026-09-22T12:00:00Z"));
    const tomorrow = generateDailyMeshTheme(new Date("2026-09-23T12:00:00Z"));

    expect(today).not.toEqual(tomorrow);
  });

  it("draws colors from more than one theme across a range of days (not just the original image palette)", () => {
    const originalImageColors = new Set([
      "#bbf7d0",
      "#86efac",
      "#d9f99d",
      "#ffffff",
      "#f7fee7",
      "#dbeafe",
      "#e0f2fe",
      "#bfdbfe",
      "#fde047",
      "#fef08a",
      "#bef264",
    ]);

    const usesOnlyOriginalPalette = (css: string) =>
      Array.from(css.matchAll(/#[0-9a-f]{6}/g)).every((m) => originalImageColors.has(m[0]));

    const days = Array.from({ length: 30 }, (_, i) =>
      generateDailyMeshTheme(new Date(2026, 0, i + 1)).background
    );

    expect(days.some((css) => !usesOnlyOriginalPalette(css))).toBe(true);
  });

  it("still returns valid layered radial-gradient CSS", () => {
    const theme = generateDailyMeshTheme(new Date("2026-09-22T12:00:00Z"));
    expect(theme.background).toContain("radial-gradient(circle at");
    expect(theme.background).toContain("linear-gradient(180deg");
  });

  it("gives the two speaker accents different colors, for every theme reachable over a range of days", () => {
    const days = Array.from({ length: 30 }, (_, i) =>
      generateDailyMeshTheme(new Date(2026, 0, i + 1))
    );

    for (const theme of days) {
      expect(theme.accentKo).not.toBe(theme.accentZh);
      expect(theme.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(theme.accentKo).toMatch(/^#[0-9a-f]{6}$/);
      expect(theme.accentZh).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("INITIAL_MESH_THEME", () => {
  it("is a fixed value with no randomness", () => {
    expect(INITIAL_MESH_THEME).toEqual(INITIAL_MESH_THEME);
    expect(INITIAL_MESH_THEME.background).toContain("radial-gradient(circle at");
    expect(INITIAL_MESH_THEME.accentKo).not.toBe(INITIAL_MESH_THEME.accentZh);
  });
});
