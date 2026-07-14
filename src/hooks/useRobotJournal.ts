import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { projectFingerprint } from "@/lib/analysis/persistence";
import { subscribeJournal, type JournalEntry, clearJournal } from "@/lib/analysis/robot-journal";

export function useRobotJournal(): {
  entries: JournalEntry[];
  clear: () => void;
} {
  const { project } = useWorkspace();
  const fingerprint = useMemo(
    () => (project ? projectFingerprint(project) : null),
    [project],
  );
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    if (!fingerprint) { setEntries([]); return; }
    return subscribeJournal(fingerprint, setEntries);
  }, [fingerprint]);

  return {
    entries,
    clear: () => fingerprint && clearJournal(fingerprint),
  };
}