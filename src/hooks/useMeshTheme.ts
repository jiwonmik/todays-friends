"use client";

import { useEffect, useState } from "react";
import {
  generateDailyMeshTheme,
  generateRandomMeshTheme,
  INITIAL_MESH_THEME,
  type MeshTheme,
} from "@/lib/mesh-background";

/** The page's gradient-mesh background theme. */
export function useMeshTheme(): MeshTheme {
  const [meshTheme, setMeshTheme] = useState(INITIAL_MESH_THEME);

  useEffect(() => {
    // Deployed: one theme per day. Local dev (`next dev`): a fresh random
    // theme on every refresh, to preview the range of themes. Both are
    // moment-dependent, so they're computed here, client-only, never during
    // render (that would cause a hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only sync of a moment-dependent value, deliberately deferred out of render to avoid a hydration mismatch
    setMeshTheme(
      process.env.NODE_ENV === "development" ? generateRandomMeshTheme() : generateDailyMeshTheme()
    );
  }, []);

  return meshTheme;
}
