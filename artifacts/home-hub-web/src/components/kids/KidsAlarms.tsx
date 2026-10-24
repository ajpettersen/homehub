import { useQuery } from "@tanstack/react-query";
import { AlarmClock, AlertTriangle, Loader2, Moon } from "lucide-react";

interface HatchAlarm { id: string; name: string; enabled: boolean; wakeTime: string | null; days: string }
interface HatchDevice { id: string; name: string; product: string; alarmsSupported: boolean; alarms: HatchAlarm[] }
interface HatchAlarmsResponse { configured: boolean; unavailable: boolean; stale: boolean; devices: HatchDevice[] }

const MODEL_NAMES: Record<string, string> = {
  restoreIot: "Hatch Restore",
  restoreV4: "Hatch Restore 2",
  restoreV5: "Hatch Restore 3",
};

function modelName(product: string): string {
  return MODEL_NAMES[product] ?? "Hatch Rest";
}

/** "06:45" -> "6:45 AM" */
function formatWakeTime(time: string | null): string {
  const match = time ? /^(\d{2}):(\d{2})$/.exec(time) : null;
  if (!match) return "No time set";
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

async function fetchAlarms(): Promise<HatchAlarmsResponse> {
  const response = await fetch("/api/hatch/alarms", { credentials: "include" });
  if (!response.ok) throw new Error("Couldn't load the alarms");
  return response.json() as Promise<HatchAlarmsResponse>;
}

export function KidsAlarms() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["hatch-alarms"],
    queryFn: fetchAlarms,
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading alarms…</div>;
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-3 rounded-3xl border-2 border-destructive/20 bg-destructive/5 p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <p className="flex-1 text-sm font-medium text-destructive">Couldn't load the alarms.</p>
        <button onClick={() => void refetch()} className="min-h-11 rounded-lg border border-destructive/30 px-3 text-xs font-bold hover:bg-destructive/10">Retry</button>
      </div>
    );
  }

  if (!data.configured) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-border bg-card px-6 py-14 text-center">
        <AlarmClock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <h3 className="font-serif text-2xl font-bold">Hatch isn't connected yet</h3>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Once HomeHub is linked to your Hatch account, your kids' wake-up alarms will show up here.
        </p>
      </div>
    );
  }

  if (data.unavailable) {
    return (
      <div className="flex items-center gap-3 rounded-3xl border-2 border-destructive/20 bg-destructive/5 p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <p className="flex-1 text-sm font-medium text-destructive">HomeHub couldn't reach Hatch just now. This can happen if the Hatch sign-in details have changed.</p>
        <button onClick={() => void refetch()} disabled={isFetching} className="min-h-11 rounded-lg border border-destructive/30 px-3 text-xs font-bold hover:bg-destructive/10 disabled:opacity-50">Retry</button>
      </div>
    );
  }

  if (data.devices.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">No Hatch devices were found on the connected account.</p>;
  }

  return (
    <div className="space-y-4">
      {data.stale && (
        <p role="status" className="rounded-2xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">
          Hatch didn't answer just now, so these may be a little out of date.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data.devices.map(device => (
          <section key={device.id} className="rounded-3xl border-2 border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Moon className="h-5 w-5" /></div>
              <div className="min-w-0">
                <h3 className="truncate font-bold text-foreground">{device.name}</h3>
                <p className="text-xs font-semibold text-muted-foreground">{modelName(device.product)}</p>
              </div>
            </div>
            {!device.alarmsSupported ? (
              <p className="text-sm text-muted-foreground">HomeHub can't read alarms from this Hatch model yet.</p>
            ) : device.alarms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alarms set up on this device.</p>
            ) : (
              <ul className="divide-y divide-border">
                {device.alarms.map(alarm => (
                  <li key={alarm.id} className={`flex items-center justify-between gap-3 py-3 ${alarm.enabled ? "" : "opacity-50"}`}>
                    <div className="min-w-0">
                      <p className="font-serif text-3xl font-bold tabular-nums">{formatWakeTime(alarm.wakeTime)}</p>
                      <p className="truncate text-sm text-muted-foreground">{alarm.name} · {alarm.days}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${alarm.enabled ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                      {alarm.enabled ? "On" : "Off"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
