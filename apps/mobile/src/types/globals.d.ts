/// <reference types="expo/types" />

// Expo generates `expo-env.d.ts` with this same reference, but that file is gitignored
// and only appears after `expo start` — this committed copy keeps `bun run typecheck`
// working on a clean checkout (and in CI). It supplies the ambient declarations for CSS
// and asset imports; without it, `*.module.css` and `global.css` imports fail to resolve.
