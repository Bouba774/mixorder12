import { DiscDJAccessibilityGate } from "../DiscDJAccessibilityGate";
import { DiscDJRobotPanel } from "../DiscDJRobotPanel";

/**
 * Robot tab — surfaces the DiscDJ automation workspace. Kept as a thin
 * wrapper so the accessibility gate stays enforced whenever the user
 * navigates here.
 */
export function RobotTab() {
  return (
    <DiscDJAccessibilityGate>
      <DiscDJRobotPanel />
    </DiscDJAccessibilityGate>
  );
}
