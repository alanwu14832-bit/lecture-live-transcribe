"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyPrefsToDocument, DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";

interface PrefsContextValue {
  prefs: Prefs;
  update(patch: Partial<Prefs>): void;
}

const Ctx = createContext<PrefsContextValue>({ prefs: DEFAULT_PREFS, update: () => {} });

export function PrefsProvider({ children }: { children: ReactNode }) {
  // SSR 時沒有 localStorage，先用預設值，掛載後再讀真的
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    applyPrefsToDocument(p);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPrefsToDocument(loadPrefs());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const update = useCallback((patch: Partial<Prefs>) => {
    const next = savePrefs(patch);
    setPrefs(next);
    applyPrefsToDocument(next);
  }, []);
  const value = useMemo(() => ({ prefs, update }), [prefs, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  return useContext(Ctx);
}
