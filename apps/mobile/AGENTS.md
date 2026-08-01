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
