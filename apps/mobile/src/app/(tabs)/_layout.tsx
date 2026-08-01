import { fontFaceId } from "@granthalaya/core";
import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useTheme } from "@/theme/theme-provider";

/**
 * The four tabs of the consumer app (P0.4), fixed now so the phases that follow have
 * somewhere to land: Today is P7's daily home, Library is P2, Study is P4–P6, Settings is
 * where the reading preferences (P2.3) go.
 *
 * They are the platform's own tab bar rather than a drawn one — it gets the blur, the
 * scroll-edge behaviour and the accessibility for free, and a devotional reading app has
 * nothing to gain from a bespoke navigation control.
 *
 * Icons are SF Symbols on iOS with an Android drawable named alongside each one. The
 * Android side is unverified: no emulator has run this project yet (see AGENTS.md).
 */
export default function TabsLayout() {
	const tokens = useTheme();

	return (
		<NativeTabs
			backgroundColor={tokens.surface}
			iconColor={{ default: tokens.inkFaint, selected: tokens.accent }}
			indicatorColor={tokens.accentMuted}
			rippleColor={tokens.accentMuted}
			labelStyle={{
				fontFamily: fontFaceId("ui", 400),
				color: tokens.inkFaint,
				selected: { color: tokens.accent },
			}}
		>
			<NativeTabs.Trigger name="index">
				<NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon sf="sun.horizon" drawable="ic_menu_today" />
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="library">
				<NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon sf="books.vertical" drawable="ic_menu_agenda" />
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="study">
				<NativeTabs.Trigger.Label>Study</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon sf="arrow.triangle.2.circlepath" drawable="ic_menu_rotate" />
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="settings">
				<NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon sf="gearshape" drawable="ic_menu_preferences" />
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
