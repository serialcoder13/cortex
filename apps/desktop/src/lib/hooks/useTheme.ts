import { useEffect } from "react";
import { useSettingsStore } from "@cortex/store";

export function useTheme() {
  const themeName = useSettingsStore((s) => s.themeName);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeName = useSettingsStore((s) => s.setThemeName);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);

  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
    document.documentElement.dataset.mode = themeMode;
  }, [themeName, themeMode]);

  return { themeName, themeMode, setThemeName, setThemeMode };
}
