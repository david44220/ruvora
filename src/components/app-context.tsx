"use client";
import { createContext, useContext } from "react";
import type { Dashboard } from "@/lib/types";
export const AppContext = createContext<{ data: Dashboard | null; reload: () => Promise<void> }>({
  data: null,
  reload: async () => {},
});
export const useDashboard = () => useContext(AppContext);
