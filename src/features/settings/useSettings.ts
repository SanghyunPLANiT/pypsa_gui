import { useState, useCallback } from 'react';

export type DateFormat = 'auto' | 'dmy' | 'mdy' | 'ymd';

export interface AppSettings {
  dateFormat: DateFormat;
}

const STORAGE_KEY = 'pypsa_gui_settings';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return { dateFormat: parsed.dateFormat ?? 'auto' };
    }
  } catch {
    // ignore
  }
  return { dateFormat: 'auto' };
}

function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function useSettings(): [AppSettings, (patch: Partial<AppSettings>) => void] {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return [settings, updateSettings];
}
