# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Running the app

**Expo Go does not work on this project.** The newest published Expo Go for SDK 57 is client
57.0.5; this project is on expo 57.0.9. Same SDK major, so Expo Go accepts the bundle and
then segfaults inside `react-native-worklets` on a JSI ABI mismatch. Use the dev build:

```sh
bunx expo run:ios       # builds, installs, launches; rerun after any native dep change
bun run start           # afterwards, just the bundler
```

`expo-modules-jsi@57.0.4` does not compile under Xcode 26.2 / Swift 6.2.3 and is patched in
`patches/expo-modules-jsi@57.0.4.patch` (`bun patch`). Drop the patch once upstream fixes it.

## Builds for real devices (EAS)

`eas.json` is committed with three profiles; all of them build in Expo's cloud, so they need
an Expo account and a one-time project link that only you can do:

```sh
bunx eas-cli login
bunx eas-cli init          # writes extra.eas.projectId into app.json — commit that
bunx eas-cli build --profile development --platform ios     # dev client, internal distribution
bunx eas-cli build --profile preview --platform android     # standalone APK, no bundler needed
```

| Profile | What it is | Use it for |
|---|---|---|
| `development` | dev client, internal distribution | the day-to-day build on your own phone |
| `development-simulator` | dev client for a simulator | a simulator build without Xcode locally |
| `preview` | standalone, internal distribution (APK on Android) | handing the app to someone else to try |
| `production` | store build, remote version bump | P8.3 |

iOS internal distribution installs on **registered devices only** — run
`bunx eas-cli device:create` once per phone before the first `development` build.

## The design language

Colour, spacing and type come from `@granthalaya/core` (`theme()`, `SPACING`, `RADIUS`,
`resolveTypeStyle`). Never write a hex value or a font size in a component: the four themes
and the Gujarati typography rules only hold because every screen goes through those.

- text: `AppText` for chrome, `ScriptureText` for anything in a book
- surfaces: `Screen`, `Card`, `List`/`ListRow`, `Button`, `Pill`, `Meter`, `EmptyState`
- the theme itself: `useTheme()` for tokens, `useThemeContext()` for the preference

Spec: `docs/design-language.md`.
