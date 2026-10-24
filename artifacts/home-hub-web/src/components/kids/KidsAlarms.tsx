import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, AlertTriangle, Loader2, Moon } from "lucide-react";

interface HatchAlarm { id: string; kind: "wake" | "bedtime"; name: string; enabled: boolean; wakeTime: string | null; days: string }
interface HatchDevice { id: string; name: string; product: string; modelName: string | null; alarmsSupported: boolean; alarms: HatchAlarm[] }
interface HatchAlarmsResponse {
  configured: boolean;
  unavailable: boolean;
  stale: boolean;
  devices: HatchDevice[];
  canManage: boolean;
  connectedAs: string | null;
  /** "app" when a parent signed in here; "env" when it was set up on the server. */
  source: "app" | "env" | null;
}

const MODEL_NAMES: Record<string, string> = {
  restMini: "Hatch Rest Mini",
  restPlus: "Hatch Rest+",
  restBaby: "Hatch Rest (original)",
  riot: "Hatch Rest (2nd gen)",
  riotPlus: "Hatch Rest+ (2nd gen)",
  restoreIot: "Hatch Restore",
  restoreV4: "Hatch Restore 2",
  restoreV5: "Hatch Restore 3",
};

function modelName(device: HatchDevice): string {
  return device.modelName ?? MODEL_NAMES[device.product] ?? "Hatch device";
}

function AlarmGroup({ title, alarms }: { title: string; alarms: HatchAlarm[] }) {
  if (alarms.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="divide-y divide-border">
        {alarms.map(alarm => (
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
    </div>
  );
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

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? fallback;
}

function ConnectForm({ intro, submitLabel }: { intro: string; submitLabel: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const connect = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/hatch/connection", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Couldn't connect to Hatch. Please try again."));
    },
    onSuccess: async () => {
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["hatch-alarms"] });
    },
  });

  return (
    <form
      className="mx-auto w-full max-w-md space-y-3 text-left"
      onSubmit={event => { event.preventDefault(); if (!connect.isPending) connect.mutate(); }}
    >
      <p className="text-center text-sm text-muted-foreground">{intro}</p>
      <label className="block text-sm font-bold">
        Hatch email
        <input
          type="email"
          name="hatch-email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          autoComplete="off"
          required
          className="mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2.5 text-base font-normal focus:border-primary focus:outline-none"
        />
      </label>
      <label className="block text-sm font-bold">
        Hatch password
        <input
          type="password"
          name="hatch-password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          autoComplete="off"
          required
          className="mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2.5 text-base font-normal focus:border-primary focus:outline-none"
        />
      </label>
      {connect.isError && <p role="alert" className="text-sm font-semibold text-destructive">{connect.error.message}</p>}
      <button
        type="submit"
        disabled={connect.isPending || !email.trim() || !password}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50"
      >
        {connect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {connect.isPending ? "Connecting…" : submitLabel}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        This is the same login you use in the Hatch app. HomeHub stores the password encrypted and only uses it to read your kids' alarms.
      </p>
    </form>
  );
}

function ConnectionFooter({ email }: { email: string }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/hatch/connection", { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error(await errorMessage(response, "Couldn't disconnect Hatch. Please try again."));
    },
    onSuccess: async () => {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ["hatch-alarms"] });
    },
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
      <span>Connected as <strong className="text-foreground">{email}</strong></span>
      {confirming ? (
        <span className="flex items-center gap-2">
          <span className="font-semibold text-foreground">Disconnect Hatch?</span>
          <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="min-h-11 rounded-lg bg-destructive px-3 text-xs font-bold text-destructive-foreground disabled:opacity-50">
            {disconnect.isPending ? "Disconnecting…" : "Yes, disconnect"}
          </button>
          <button onClick={() => setConfirming(false)} disabled={disconnect.isPending} className="min-h-11 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted">Cancel</button>
        </span>
      ) : (
        <button onClick={() => setConfirming(true)} className="min-h-11 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted">Disconnect</button>
      )}
      {disconnect.isError && <p role="alert" className="w-full text-sm font-semibold text-destructive">{disconnect.error.message}</p>}
    </div>
  );
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
      <div className="rounded-3xl border-2 border-dashed border-border bg-card px-6 py-12">
        <div className="mb-6 text-center">
          <AlarmClock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <h3 className="font-serif text-2xl font-bold">Connect Hatch</h3>
        </div>
        {data.canManage ? (
          <ConnectForm intro="Sign in to Hatch to see your kids' wake-up alarms here." submitLabel="Connect Hatch" />
        ) : (
          <p className="mx-auto max-w-md text-center text-muted-foreground">Ask a parent to connect Hatch, and the kids' wake-up alarms will show up here.</p>
        )}
      </div>
    );
  }

  if (data.unavailable) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-3xl border-2 border-destructive/20 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <p className="flex-1 text-sm font-medium text-destructive">HomeHub couldn't reach Hatch just now. If you changed your Hatch password, sign in again below.</p>
          <button onClick={() => void refetch()} disabled={isFetching} className="min-h-11 rounded-lg border border-destructive/30 px-3 text-xs font-bold hover:bg-destructive/10 disabled:opacity-50">Retry</button>
        </div>
        {data.canManage && data.source === "app" && (
          <div className="rounded-3xl border-2 border-border bg-card px-6 py-8">
            <ConnectForm intro="Sign in to Hatch again." submitLabel="Sign in again" />
          </div>
        )}
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
                <p className="text-xs font-semibold text-muted-foreground">{modelName(device)}</p>
              </div>
            </div>
            {!device.alarmsSupported ? (
              <p className="text-sm text-muted-foreground">HomeHub couldn't read this device's schedules just now.</p>
            ) : device.alarms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No wake-up or bedtime schedule found. Some Hatch models only keep their schedules inside the device.</p>
            ) : (
              <div className="space-y-4">
                <AlarmGroup title="Wake-up" alarms={device.alarms.filter(alarm => alarm.kind === "wake")} />
                <AlarmGroup title="Bedtime" alarms={device.alarms.filter(alarm => alarm.kind === "bedtime")} />
              </div>
            )}
          </section>
        ))}
      </div>
      {data.canManage && data.source === "app" && data.connectedAs && <ConnectionFooter email={data.connectedAs} />}
    </div>
  );
}
