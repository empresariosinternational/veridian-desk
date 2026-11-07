"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SceneBridgeData = {
  following: { id: string; name: string; events: number; avatar?: string | null }[];
  convergingHosts: { id: string; name: string; eventName: string; overlap: number }[];
  sceneQs: string;
  eventCount: number;
};

type SceneBridgeValue = SceneBridgeData & {
  setScene: (v: SceneBridgeData) => void;
};

const empty: SceneBridgeData = {
  following: [],
  convergingHosts: [],
  sceneQs: "",
  eventCount: 0,
};

const Ctx = createContext<SceneBridgeValue>({
  ...empty,
  setScene: () => {},
});

export function SceneProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SceneBridgeData>(empty);
  const value = useMemo<SceneBridgeValue>(
    () => ({ ...state, setScene: setState }),
    [state],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSceneBridge() {
  return useContext(Ctx);
}

/** Push digest context into the Veridian dock from a page. */
export function SceneBridgeSync({
  following,
  convergingHosts,
  sceneQs,
  eventCount,
}: SceneBridgeData) {
  const { setScene } = useSceneBridge();
  useEffect(() => {
    setScene({ following, convergingHosts, sceneQs, eventCount });
  }, [following, convergingHosts, sceneQs, eventCount, setScene]);
  return null;
}
