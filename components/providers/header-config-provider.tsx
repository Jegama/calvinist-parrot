"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface HeaderConfig {
  disableShrinking: boolean;
}

interface HeaderConfigContextType {
  config: HeaderConfig;
  setConfig: (config: Partial<HeaderConfig>) => void;
}

const HeaderConfigContext = createContext<HeaderConfigContextType | undefined>(undefined);

export function HeaderConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<HeaderConfig>({
    disableShrinking: false,
  });

  const setConfig = useCallback((newConfig: Partial<HeaderConfig>) => {
    setConfigState((prev) => ({ ...prev, ...newConfig }));
  }, []);

  return <HeaderConfigContext.Provider value={{ config, setConfig }}>{children}</HeaderConfigContext.Provider>;
}

export function useHeaderConfig() {
  const context = useContext(HeaderConfigContext);
  if (context === undefined) {
    throw new Error("useHeaderConfig must be used within a HeaderConfigProvider");
  }
  return context;
}
