import type { PluginZenticApi } from "./reference-api.js";
import { createContext, useContext, type ReactNode } from "react";

const ZenticApiContext = createContext<PluginZenticApi | null>(null);

export function useZenticContextValue(): PluginZenticApi | null {
  return useContext(ZenticApiContext);
}

export function ZenticApiProvider({
  children,
  zentic,
}: {
  children: ReactNode;
  zentic: PluginZenticApi;
}) {
  return <ZenticApiContext.Provider value={zentic}>{children}</ZenticApiContext.Provider>;
}

export function useZentic(): PluginZenticApi {
  const zentic = useZenticContextValue();
  if (!zentic) throw new Error("useZentic must run inside a contributed plugin surface");
  return zentic;
}
