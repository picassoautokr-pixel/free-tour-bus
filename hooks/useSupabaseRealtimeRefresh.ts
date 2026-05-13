"use client";

import { useEffect, useRef, useState } from "react";

import { createSupabaseClient } from "@/lib/supabase";

export type RealtimeConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

type RealtimePayload = {
  eventType?: string;
  table?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

type Params = {
  channelName: string;
  tables: string[];
  enabled?: boolean;
  debounceMs?: number;
  onRefresh: () => void | Promise<void>;
  onEvent?: (payload: RealtimePayload) => void;
};

export function realtimeStatusLabel(status: RealtimeConnectionStatus): string {
  if (status === "connected") return "실시간 연결됨";
  if (status === "connecting") return "실시간 연결 중";
  if (status === "reconnecting") return "실시간 재연결 중";
  return "실시간 연결 끊김";
}

export function useSupabaseRealtimeRefresh({
  channelName,
  tables,
  enabled = true,
  debounceMs = 800,
  onRefresh,
  onEvent,
}: Params): RealtimeConnectionStatus {
  const [status, setStatus] = useState<RealtimeConnectionStatus>("connecting");
  const refreshRef = useRef(onRefresh);
  const eventRef = useRef(onEvent);
  const timerRef = useRef<number | null>(null);

  refreshRef.current = onRefresh;
  eventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");
    const supabase = createSupabaseClient();
    const channel = supabase.channel(channelName);

    const scheduleRefresh = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void refreshRef.current();
      }, debounceMs);
    };

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          eventRef.current?.(payload as RealtimePayload);
          scheduleRefresh();
        },
      );
    }

    channel.subscribe((nextStatus) => {
      if (nextStatus === "SUBSCRIBED") setStatus("connected");
      else if (
        nextStatus === "CHANNEL_ERROR" ||
        nextStatus === "TIMED_OUT" ||
        nextStatus === "CLOSED"
      ) {
        setStatus("reconnecting");
      }
    });

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
      void supabase.removeChannel(channel);
    };
  }, [channelName, debounceMs, enabled, tables.join("|")]);

  return status;
}

