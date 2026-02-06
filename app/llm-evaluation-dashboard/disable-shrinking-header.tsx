"use client";

import { useEffect } from "react";
import { useHeaderConfig } from "@/components/providers/header-config-provider";

/**
 * Component that disables header shrinking for the AI evaluation dashboard.
 * Place this at the top of the page component to configure the header behavior.
 */
export function DisableShrinkingHeader() {
  const { setConfig } = useHeaderConfig();

  useEffect(() => {
    // Disable shrinking when this component mounts
    setConfig({ disableShrinking: true });

    // Re-enable shrinking when navigating away
    return () => {
      setConfig({ disableShrinking: false });
    };
  }, [setConfig]);

  return null;
}
