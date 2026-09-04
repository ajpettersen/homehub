import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "homehub-preferences";
const PREFERENCE_VERSION = 1 as const;

export type ColorMode = "light" | "dark";
export type Density = "comfortable" | "compact";
export type ChoreFilter = "all" | "today" | "mine" | "done";
export type MealView = "meals" | "shopping" | "recipes";
export type SettingsSection = "none" | "properties" | "notifications" | "memory";

export interface HomeHubPreferences {
  version: typeof PREFERENCE_VERSION;
  appearance: {
    colorMode: ColorMode;
    density: Density;
  };
  tabs: {
    home: { focus: "overview" | "assistant" };
    chores: { defaultFilter: ChoreFilter };
    meals: { defaultView: MealView };
    tasks: { layout: "columns" | "list" };
    workouts: { defaultScope: "everyone" | "active" };
    properties: { defaultProperty: string };
    people: { layout: "cards" | "compact" };
    settings: { startSection: SettingsSection };
  };
}

export const DEFAULT_PREFERENCES: HomeHubPreferences = {
  version: PREFERENCE_VERSION,
  appearance: { colorMode: "light", density: "comfortable" },
  tabs: {
    home: { focus: "overview" },
    chores: { defaultFilter: "all" },
    meals: { defaultView: "meals" },
    tasks: { layout: "columns" },
    workouts: { defaultScope: "everyone" },
    properties: { defaultProperty: "cabin" },
    people: { layout: "cards" },
    settings: { startSection: "properties" },
  },
};

const isOneOf = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  typeof value === "string" && values.includes(value as T) ? value as T : fallback;

function parsePreferences(raw: string | null): HomeHubPreferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    type StoredPreferences = {
      version?: number;
      appearance?: Partial<HomeHubPreferences["appearance"]>;
      tabs?: { [K in keyof HomeHubPreferences["tabs"]]?: Partial<HomeHubPreferences["tabs"][K]> };
    };
    const value = JSON.parse(raw) as StoredPreferences;
    if (value.version !== PREFERENCE_VERSION) return DEFAULT_PREFERENCES;
    const appearance = value.appearance ?? {};
    const tabs = value.tabs ?? {};
    const savedSettingsStartSection = tabs.settings?.startSection as string | undefined;
    return {
      version: PREFERENCE_VERSION,
      appearance: {
        colorMode: isOneOf(appearance.colorMode, ["light", "dark"], DEFAULT_PREFERENCES.appearance.colorMode),
        density: isOneOf(appearance.density, ["comfortable", "compact"], DEFAULT_PREFERENCES.appearance.density),
      },
      tabs: {
        home: {
          focus: isOneOf(tabs.home?.focus, ["overview", "assistant"], DEFAULT_PREFERENCES.tabs.home.focus),
        },
        chores: {
          defaultFilter: isOneOf(tabs.chores?.defaultFilter, ["all", "today", "mine", "done"], DEFAULT_PREFERENCES.tabs.chores.defaultFilter),
        },
        meals: {
          defaultView: isOneOf(tabs.meals?.defaultView, ["meals", "shopping", "recipes"], DEFAULT_PREFERENCES.tabs.meals.defaultView),
        },
        tasks: {
          layout: isOneOf(tabs.tasks?.layout, ["columns", "list"], DEFAULT_PREFERENCES.tabs.tasks.layout),
        },
        workouts: {
          defaultScope: isOneOf(tabs.workouts?.defaultScope, ["everyone", "active"], DEFAULT_PREFERENCES.tabs.workouts.defaultScope),
        },
        properties: {
          defaultProperty: typeof tabs.properties?.defaultProperty === "string"
            ? tabs.properties.defaultProperty
            : DEFAULT_PREFERENCES.tabs.properties.defaultProperty,
        },
        people: {
          layout: isOneOf(tabs.people?.layout, ["cards", "compact"], DEFAULT_PREFERENCES.tabs.people.layout),
        },
        settings: {
          // "members" was the former Settings landing section. Preserve every
          // other saved preference while moving those users to Properties.
          startSection: savedSettingsStartSection === "members"
            ? "properties"
            : isOneOf(savedSettingsStartSection, ["none", "properties", "notifications", "memory"], DEFAULT_PREFERENCES.tabs.settings.startSection),
        },
      },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

interface PreferencesContextValue {
  preferences: HomeHubPreferences;
  setAppearance: <K extends keyof HomeHubPreferences["appearance"]>(
    key: K,
    value: HomeHubPreferences["appearance"][K],
  ) => void;
  setTabPreference: <T extends keyof HomeHubPreferences["tabs"], K extends keyof HomeHubPreferences["tabs"][T]>(
    tab: T,
    key: K,
    value: HomeHubPreferences["tabs"][T][K],
  ) => void;
  resetPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function loadPreferences(): HomeHubPreferences {
  try {
    return parsePreferences(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<HomeHubPreferences>(loadPreferences);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Private browsing and storage-disabled browsers still get working in-memory preferences.
    }
    document.documentElement.classList.toggle("dark", preferences.appearance.colorMode === "dark");
    document.documentElement.dataset.colorMode = preferences.appearance.colorMode;
    document.documentElement.dataset.density = preferences.appearance.density;
  }, [preferences]);

  const value = useMemo<PreferencesContextValue>(() => ({
    preferences,
    setAppearance: (key, value) => setPreferences(current => ({
      ...current,
      appearance: { ...current.appearance, [key]: value },
    })),
    setTabPreference: (tab, key, value) => setPreferences(current => ({
      ...current,
      tabs: {
        ...current.tabs,
        [tab]: { ...current.tabs[tab], [key]: value },
      },
    })),
    resetPreferences: () => setPreferences(DEFAULT_PREFERENCES),
  }), [preferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used inside PreferencesProvider");
  return context;
}