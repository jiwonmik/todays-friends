@AGENTS.md

# Project rules

## TypeScript types

- Never use `any` — not in annotations, casts, generics, or tests. (ESLint's
  `@typescript-eslint/no-explicit-any` also fails `npm run lint` on it.)
- Don't write object types inline at the point of use. Create a named
  `interface` / `type` first and annotate with that name — including in casts
  like `window as unknown as SomeNamedType`.
- For data whose shape isn't known yet (parsed JSON, external input), use
  `unknown` and narrow it with type guards, instead of `any`.
