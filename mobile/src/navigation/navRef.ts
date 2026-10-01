import { createNavigationContainerRef } from "@react-navigation/native";

export type TabName = "Today" | "Lists" | "Assistant" | "Calendar";

/** Module-level navigation ref.
 *
 * The header and the feed cards need to switch tabs, but neither sits inside
 * the navigator — Header is a sibling of it inside Shell, and SheetsProvider
 * wraps the whole NavigationContainer. useNavigation() only works below a
 * navigator, so a ref is the way both can reach it.
 */
export const navRef = createNavigationContainerRef();

export function goToTab(name: TabName) {
  if (navRef.isReady()) navRef.navigate(name as never);
}
