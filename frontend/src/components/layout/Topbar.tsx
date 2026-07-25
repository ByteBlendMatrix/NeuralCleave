"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Menu, RotateCcw } from "lucide-react";
import api from "@/lib/api";

interface GatewayStatus {
  status: string;
  uptime_seconds?: number;
}

interface TopbarProps {
  onMenuClick: () => void;
}

/** Seconds before we stop calling it "Starting" and switch to "Connecting…" */
const STARTUP_GRACE_SECONDS = 15;

export function Topbar({ onMenuClick }: TopbarProps) {
  const queryClient = useQueryClient();
  const mountTimeRef = useRef(Date.now());
  const [secondsSinceMount, setSecondsSinceMount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  // Tick every second so the countdown label stays live.
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsSinceMount(Math.floor((Date.now() - mountTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const { data, isError, isFetching } = useQuery<GatewayStatus>({
    queryKey: ["gateway-status"],
    queryFn: async () => {
      const { data } = await api.get<GatewayStatus>("/status");
      return data;
    },
    // Poll every 5 s while offline so we catch the sidecar coming up quickly;
    // back off to 30 s once we've confirmed it's alive.
    refetchInterval: (query) =>
      query.state.data?.status === "ok" ? 30_000 : 5_000,
    // Retry up to 3 times on the very first fetch (sidecar startup delay)
    // before treating it as an error.
    retry: 3,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
  });

  const online = !isError && data?.status === "ok";

  const handleRetry = useCallback(() => {
    setRetrying(true);
    void queryClient
      .invalidateQueries({ queryKey: ["gateway-status"] })
      .finally(() => setRetrying(false));
  }, [queryClient]);

  const statusLabel = () => {
    if (online) return "Gateway online";
    if (isFetching || retrying) return "Checking…";
    if (secondsSinceMount < STARTUP_GRACE_SECONDS) return "Starting gateway…";
    return "Connecting…";
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="hidden text-sm text-slate-400 sm:inline">
          Personal AI Assistant Gateway
        </span>
      </div>

      <div className="flex items-center gap-2">
        {!online && !isFetching && !retrying && (
          <button
            onClick={handleRetry}
            className="hidden items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300 sm:flex"
            title="Retry connection"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        )}
        <Activity className="h-4 w-4 text-slate-500" />
        <span
          className={`hidden text-xs font-medium sm:inline ${
            online ? "text-emerald-400" : "text-slate-500"
          }`}
        >
          {statusLabel()}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${
            online
              ? "bg-emerald-400"
              : isFetching || retrying
                ? "animate-pulse bg-amber-400"
                : "bg-slate-600"
          }`}
        />
      </div>
    </header>
  );
}
