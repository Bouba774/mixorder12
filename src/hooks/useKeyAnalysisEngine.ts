import { useEffect, useState } from "react";
import { keyAnalysisEngine } from "@/lib/key-analysis/engine";
import type { EngineStats } from "@/lib/key-analysis/types";

/** Subscribe to the singleton engine and re-render on progress updates. */
export function useKeyAnalysisEngine(): EngineStats {
  const [stats, setStats] = useState<EngineStats>(() => keyAnalysisEngine.snapshot());
  useEffect(() => keyAnalysisEngine.subscribe(setStats), []);
  return stats;
}