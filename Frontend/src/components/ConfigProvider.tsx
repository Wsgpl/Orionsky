import { PropsWithChildren, useEffect } from "react";
import { useConfig } from "../hooks/useConfig";

export function ConfigProvider({ children }: PropsWithChildren) {
  const { error } = useConfig();

  useEffect(() => {
    if (error) {
      console.warn("Config provider is using fallback settings:", error);
    }
  }, [error]);

  return <>{children}</>;
}
