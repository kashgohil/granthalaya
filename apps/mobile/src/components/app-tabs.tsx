import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";

export default function AppTabs() {
	const scheme = useColorScheme();
	const colors = Colors[scheme === "unspecified" ? "light" : scheme];

	return (
		<NativeTabs
			backgroundColor={colors.background}
			indicatorColor={colors.backgroundElement}
			labelStyle={{ selected: { color: colors.text } }}
		>
			<NativeTabs.Trigger name="index">
				<NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					src={require("@/assets/images/tabIcons/home.png")}
					renderingMode="template"
				/>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="explore">
				<NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					src={require("@/assets/images/tabIcons/explore.png")}
					renderingMode="template"
				/>
			</NativeTabs.Trigger>

			{/* The P0.3 rendering test screen. It is a QA surface, not a product one — the
			    reason it is a tab is that the check has to happen on a real device, where
			    there is no dev menu to route from. P0.4 replaces this shell. */}
			<NativeTabs.Trigger name="typography">
				<NativeTabs.Trigger.Label>Type</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon sf="textformat" drawable="ic_menu_sort_alphabetically" />
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
