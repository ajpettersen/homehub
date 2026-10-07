import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun,
  Home, ListChecks, Moon, Sun, UtensilsCrossed, Wrench, WifiOff,
  type LucideIcon,
} from "lucide-react";
import { getLocalDateOnly, getResolvedTimeZone } from "@/lib/dateOnly";

interface KioskWeather {
  temperatureF: number;
  feelsLikeF: number;
  windMph: number;
  humidityPct: number;
  code: number;
  isDay: boolean;
  highF: number;
  lowF: number;
  rainChancePct: number;
  sunrise: string | null;
  sunset: string | null;
  forecast: Array<{ date: string; highF: number; lowF: number; code: number; rainChancePct: number }>;
}
interface KioskEvent { id: string; title: string; start: string; end: string | null; allDay: boolean; calendar: string }
interface KioskChore {
  id: string; title: string; assigneeName: string | null; assigneeColor: string | null;
  assigneeInitials: string | null; dueDate: string | null; isOverdue: boolean; points: number; awaitingApproval: boolean;
}
interface KioskMeal { id: string; dayOfWeek: number; mealType: string; meal: string }
interface KioskMaintenance { id: string; title: string; propertyName: string; nextDueDate: string; isOverdue: boolean }
interface KioskSummary {
  householdName: string;
  today: string;
  weekStart: string;
  weather: KioskWeather | null;
  meals: KioskMeal[];
  chores: KioskChore[];
  maintenance: KioskMaintenance[];
  calendar: { configured: boolean; events: KioskEvent[]; failedCalendars: string[] };
}

type Tab = "home" | "calendar" | "chores" | "meals";
type LoadState =
  | { kind: "loading" }
  | { kind: "needsPairing"; message?: string }
  | { kind: "notConfigured" }
  | { kind: "error"; message: string }
  | { kind: "ready"; summary: KioskSummary };

const REFRESH_MS = 60_000;
const BACK_TO_HOME_MS = 2 * 60_000;
const NIGHT_PEEK_MS = 2 * 60_000;
const MEAL_ORDER = ["breakfast", "lunch", "dinner"];
// Meal plans store 0 = Sunday; the screen lists weeks starting Monday.
const WEEK_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const TABS: Array<{ id: Tab; label: string; Icon: LucideIcon }> = [
  { id: "home", label: "Home", Icon: Home },
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
  { id: "chores", label: "Chores", Icon: ListChecks },
  { id: "meals", label: "Meals", Icon: UtensilsCrossed },
];

function weatherIcon(code: number, isDay = true): LucideIcon {
  if (code === 0) return isDay ? Sun : Moon;
  if (code <= 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 95) return CloudLightning;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow;
  return CloudRain;
}

function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorms";
  return "Mixed";
}

/** Open-Meteo gives sunrise/sunset as local wall-clock text like "2026-10-07T18:24". */
function clockTime(localIso: string | null): string | null {
  const match = localIso ? /T(\d{2}):(\d{2})/.exec(localIso) : null;
  if (!match) return null;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T12:00:00`);
  date.setDate(date.getDate() + days);
  return getLocalDateOnly(date);
}

function dayHeading(dateOnly: string, today: string): string {
  if (dateOnly === today) return "Today";
  if (dateOnly === addDays(today, 1)) return "Tomorrow";
  return new Date(`${dateOnly}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function shortDay(dateOnly: string, today: string): string {
  if (dateOnly === today || dateOnly === addDays(today, 1)) return dayHeading(dateOnly, today);
  return new Date(`${dateOnly}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function eventTime(event: KioskEvent): string {
  if (event.allDay) return "All day";
  return new Date(event.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function eventsOnDay(events: KioskEvent[], day: string): KioskEvent[] {
  return events.filter(event => {
    if (event.allDay) {
      const lastDay = event.end && event.end > event.start ? addDays(event.end, -1) : event.start;
      return event.start <= day && day <= lastDay;
    }
    return getLocalDateOnly(new Date(event.start)) === day;
  }).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function Card({ title, Icon, children, className = "" }: { title: string; Icon: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-border bg-card p-6 ${className}`}>
      <h2 className="mb-4 flex items-center gap-3 text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-5 w-5" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-xl text-muted-foreground">{children}</p>;
}

function ChoreRow({ chore }: { chore: KioskChore }) {
  return (
    <li className="flex items-center gap-4 py-2.5">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
        style={{ backgroundColor: chore.assigneeColor ?? "#9ca3af" }}
        aria-label={chore.assigneeName ?? "Anyone"}
      >
        {chore.assigneeInitials ?? "·"}
      </span>
      <span className="min-w-0 flex-1 text-2xl font-semibold leading-snug">{chore.title}</span>
      {chore.awaitingApproval && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">Check pending</span>}
      {chore.isOverdue && <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-bold text-destructive">Overdue</span>}
    </li>
  );
}

function WeatherCard({ weather, today }: { weather: KioskWeather; today: string }) {
  const sunrise = clockTime(weather.sunrise);
  const sunset = clockTime(weather.sunset);
  const NowIcon = weatherIcon(weather.code, weather.isDay);
  return (
    <Card title="Weather" Icon={Cloud}>
      <div className="mb-5 flex items-center gap-4">
        <NowIcon className="h-12 w-12 shrink-0 text-primary" />
        <div>
          <p className="text-3xl font-bold">{weatherLabel(weather.code)}</p>
          <p className="text-xl text-muted-foreground">
            Feels like {weather.feelsLikeF}° · Wind {weather.windMph} mph · {weather.rainChancePct}% rain today
          </p>
        </div>
      </div>
      <ul className="grid grid-cols-5 gap-2 text-center">
        {weather.forecast.map(day => {
          const DayIcon = weatherIcon(day.code);
          return (
            <li key={day.date} className="rounded-2xl bg-muted/60 px-1 py-3">
              <p className="text-lg font-bold">{day.date === today ? "Today" : new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</p>
              <DayIcon className="mx-auto my-2 h-9 w-9 text-primary" />
              <p className="text-xl font-bold tabular-nums">{day.highF}°</p>
              <p className="text-lg tabular-nums text-muted-foreground">{day.lowF}°</p>
              <p className={`mt-1 text-base font-semibold tabular-nums ${day.rainChancePct >= 40 ? "text-primary" : "text-muted-foreground"}`}>{day.rainChancePct}%</p>
            </li>
          );
        })}
      </ul>
      {(sunrise || sunset) && (
        <p className="mt-4 text-center text-lg text-muted-foreground">
          {sunrise && <>Sunrise {sunrise}</>}{sunrise && sunset && " · "}{sunset && <>Sunset {sunset}</>}
        </p>
      )}
    </Card>
  );
}

function HomeTab({ summary, now }: { summary: KioskSummary; now: Date }) {
  const today = summary.today;
  const todayEvents = eventsOnDay(summary.calendar.events, today);
  const todayDow = new Date(`${today}T12:00:00`).getDay();
  const todayMeals = summary.meals
    .filter(meal => meal.dayOfWeek === todayDow)
    .sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType));
  const urgentMaintenance = summary.maintenance.filter(task => task.nextDueDate <= addDays(today, 7)).slice(0, 4);
  void now;

  return (
    <div className="space-y-5">
      {summary.weather && <WeatherCard weather={summary.weather} today={today} />}
      <Card title="Today on the calendar" Icon={CalendarDays}>
        {!summary.calendar.configured ? (
          <Empty>No calendar connected yet.</Empty>
        ) : todayEvents.length === 0 ? (
          <Empty>Nothing scheduled today.</Empty>
        ) : (
          <ul className="space-y-3">
            {todayEvents.slice(0, 6).map(event => (
              <li key={event.id} className="flex items-baseline gap-4">
                <span className="w-28 shrink-0 text-xl font-bold tabular-nums text-primary">{eventTime(event)}</span>
                <span className="min-w-0 flex-1 text-2xl font-semibold leading-snug">{event.title}</span>
              </li>
            ))}
            {todayEvents.length > 6 && <li className="text-lg text-muted-foreground">+ {todayEvents.length - 6} more</li>}
          </ul>
        )}
      </Card>

      <Card title="Today's meals" Icon={UtensilsCrossed}>
        {todayMeals.length === 0 ? <Empty>No meals planned today.</Empty> : (
          <ul className="space-y-3">
            {todayMeals.map(meal => (
              <li key={meal.id} className="flex items-baseline gap-4">
                <span className="w-28 shrink-0 text-lg font-bold capitalize text-primary">{meal.mealType}</span>
                <span className="min-w-0 flex-1 text-2xl font-semibold leading-snug">{meal.meal}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Chores to do" Icon={ListChecks}>
        {summary.chores.length === 0 ? <Empty>All caught up. 🎉</Empty> : (
          <ul className="divide-y divide-border">
            {summary.chores.slice(0, 6).map(chore => <ChoreRow key={chore.id} chore={chore} />)}
            {summary.chores.length > 6 && <li className="pt-3 text-lg text-muted-foreground">+ {summary.chores.length - 6} more in Chores</li>}
          </ul>
        )}
      </Card>

      {urgentMaintenance.length > 0 && (
        <Card title="Home maintenance due" Icon={Wrench}>
          <ul className="space-y-3">
            {urgentMaintenance.map(task => (
              <li key={task.id} className="flex items-baseline gap-4">
                <span className={`w-36 shrink-0 text-lg font-bold ${task.isOverdue ? "text-destructive" : "text-primary"}`}>
                  {task.isOverdue ? "Overdue" : shortDay(task.nextDueDate, today)}
                </span>
                <span className="min-w-0 flex-1 text-2xl font-semibold leading-snug">
                  {task.title}{task.propertyName && <span className="text-lg font-medium text-muted-foreground"> · {task.propertyName}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function CalendarTab({ summary }: { summary: KioskSummary }) {
  const days = Array.from({ length: 14 }, (_, index) => addDays(summary.today, index));
  const withEvents = days.map(day => ({ day, events: eventsOnDay(summary.calendar.events, day) }));
  if (!summary.calendar.configured) {
    return <Card title="Calendar" Icon={CalendarDays}><Empty>No calendar is connected yet. Ask whoever set up this screen to add one.</Empty></Card>;
  }
  return (
    <div className="space-y-4">
      {summary.calendar.failedCalendars.length > 0 && (
        <p className="rounded-2xl bg-amber-100 px-5 py-3 text-lg font-semibold text-amber-900">
          Couldn't load: {summary.calendar.failedCalendars.join(", ")}
        </p>
      )}
      {withEvents.map(({ day, events }) => (
        <section key={day} className={`rounded-3xl border p-5 ${day === summary.today ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
          <h2 className="mb-2 text-2xl font-bold">{dayHeading(day, summary.today)}</h2>
          {events.length === 0 ? <p className="text-lg text-muted-foreground">Free</p> : (
            <ul className="space-y-2">
              {events.map(event => (
                <li key={event.id} className="flex items-baseline gap-4">
                  <span className="w-28 shrink-0 text-xl font-bold tabular-nums text-primary">{eventTime(event)}</span>
                  <span className="min-w-0 flex-1 text-2xl font-semibold leading-snug">{event.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function ChoresTab({ summary }: { summary: KioskSummary }) {
  const groups = useMemo(() => {
    const byPerson = new Map<string, KioskChore[]>();
    for (const chore of summary.chores) {
      const key = chore.assigneeName ?? "Anyone";
      byPerson.set(key, [...(byPerson.get(key) ?? []), chore]);
    }
    return [...byPerson.entries()].sort(([a], [b]) => (a === "Anyone" ? 1 : b === "Anyone" ? -1 : a.localeCompare(b)));
  }, [summary.chores]);

  if (groups.length === 0) return <Card title="Chores" Icon={ListChecks}><Empty>Nothing due. Nice work, everyone. 🎉</Empty></Card>;
  return (
    <div className="space-y-5">
      {groups.map(([person, chores]) => (
        <Card key={person} title={person} Icon={ListChecks}>
          <ul className="divide-y divide-border">{chores.map(chore => <ChoreRow key={chore.id} chore={chore} />)}</ul>
        </Card>
      ))}
    </div>
  );
}

function MealsTab({ summary }: { summary: KioskSummary }) {
  const todayDow = new Date(`${summary.today}T12:00:00`).getDay();
  return (
    <div className="space-y-4">
      {WEEK_DAY_ORDER.map((dow, index) => {
        const date = addDays(summary.weekStart, index);
        const meals = summary.meals.filter(meal => meal.dayOfWeek === dow)
          .sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType));
        const isToday = dow === todayDow;
        return (
          <section key={dow} className={`rounded-3xl border p-5 ${isToday ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
            <h2 className="mb-2 text-2xl font-bold">
              {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" })}
              {isToday && <span className="ml-3 text-base font-bold uppercase tracking-wide text-primary">Today</span>}
            </h2>
            {meals.length === 0 ? <p className="text-lg text-muted-foreground">Nothing planned</p> : (
              <ul className="space-y-2">
                {meals.map(meal => (
                  <li key={meal.id} className="flex items-baseline gap-4">
                    <span className="w-28 shrink-0 text-lg font-bold capitalize text-primary">{meal.mealType}</span>
                    <span className="min-w-0 flex-1 text-2xl font-semibold leading-snug">{meal.meal}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Header({ summary, now }: { summary: KioskSummary | null; now: Date }) {
  const WeatherIcon = summary?.weather ? weatherIcon(summary.weather.code, summary.weather.isDay) : null;
  return (
    <header className="flex items-end justify-between gap-6 px-8 pb-4 pt-8">
      <div>
        <p className="font-serif text-7xl font-bold leading-none tabular-nums">
          {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </p>
        <p className="mt-3 text-2xl font-semibold text-muted-foreground">
          {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>
      {summary?.weather && WeatherIcon && (
        <div className="text-right">
          <div className="flex items-center justify-end gap-3">
            <WeatherIcon className="h-14 w-14 text-primary" />
            <span className="font-serif text-6xl font-bold tabular-nums">{summary.weather.temperatureF}°</span>
          </div>
          <p className="mt-1 text-xl font-semibold text-muted-foreground">{weatherLabel(summary.weather.code)} · H {summary.weather.highF}° · L {summary.weather.lowF}°</p>
        </div>
      )}
    </header>
  );
}

function NightClock({ now, onWake }: { now: Date; onWake: () => void }) {
  return (
    <button
      type="button"
      onClick={onWake}
      className="flex min-h-screen w-full cursor-none select-none flex-col items-center justify-center bg-black text-neutral-500"
      aria-label="Wake the screen"
    >
      <Moon className="mb-6 h-10 w-10" />
      <span className="font-serif text-8xl font-bold tabular-nums">
        {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </span>
      <span className="mt-4 text-2xl">Tap to wake</span>
    </button>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-10 text-center">
      <h1 className="font-serif text-4xl font-bold">{title}</h1>
      <div className="max-w-xl space-y-3 text-xl text-muted-foreground">{children}</div>
    </div>
  );
}

function PairingScreen({ initialMessage, onPaired }: { initialMessage?: string; onPaired: () => void }) {
  const [key, setKey] = useState("");
  const [message, setMessage] = useState(initialMessage ?? "");
  const [busy, setBusy] = useState(false);

  const pair = useCallback(async (candidate: string) => {
    if (!candidate.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/kiosk/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: candidate.trim() }),
      });
      if (response.ok) { onPaired(); return; }
      const body = await response.json().catch(() => null) as { error?: string } | null;
      setMessage(body?.error ?? "Couldn't pair this screen. Try again.");
    } catch {
      setMessage("Couldn't reach HomeHub. Check the internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [onPaired]);

  // A link ending in #key=… pairs without typing. The part after # is never
  // sent to the server or logged, and is removed from the address bar here.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("key");
    if (!fromLink) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    void pair(fromLink);
  }, [pair]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-10 text-center">
      <h1 className="font-serif text-4xl font-bold">Pair this screen</h1>
      <p className="max-w-xl text-xl text-muted-foreground">Enter the HomeHub screen key once. This screen will remember it.</p>
      <form className="flex w-full max-w-xl flex-col gap-4" onSubmit={event => { event.preventDefault(); void pair(key); }}>
        <input
          type="password"
          value={key}
          onChange={event => setKey(event.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Screen key"
          placeholder="Screen key"
          className="rounded-2xl border-2 border-border bg-card px-6 py-5 text-center text-2xl focus:border-primary focus:outline-none"
        />
        <button type="submit" disabled={busy || !key.trim()} className="min-h-20 rounded-2xl bg-primary text-2xl font-bold text-primary-foreground disabled:opacity-50">
          {busy ? "Pairing…" : "Pair this screen"}
        </button>
      </form>
      {message && <p role="alert" className="text-xl font-semibold text-destructive">{message}</p>}
    </div>
  );
}

export default function Kiosk() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [tab, setTab] = useState<Tab>("home");
  const [offline, setOffline] = useState(false);
  const [peekUntil, setPeekUntil] = useState(0);
  const now = useNow(15_000);
  const loadedDay = useRef<string | null>(null);
  const lastTouch = useRef(Date.now());
  const timeZone = useMemo(() => getResolvedTimeZone(), []);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/kiosk/summary?timezone=${encodeURIComponent(timeZone)}`, { cache: "no-store" });
      if (response.status === 401) {
        setState({ kind: "needsPairing" });
        return;
      }
      if (response.status === 503) {
        const body = await response.json().catch(() => null) as { code?: string; error?: string } | null;
        if (body?.code === "not_configured") { setState({ kind: "notConfigured" }); return; }
        throw new Error(body?.error ?? "Server said 503");
      }
      if (!response.ok) throw new Error(`Server said ${response.status}`);
      const summary = await response.json() as KioskSummary;
      // A new day is a good moment to pick up any new version of the app.
      if (loadedDay.current && loadedDay.current !== summary.today) {
        window.location.reload();
        return;
      }
      loadedDay.current = summary.today;
      setOffline(false);
      setState({ kind: "ready", summary });
    } catch (error) {
      // Keep showing the last good data if the connection blips.
      setOffline(true);
      setState(current => current.kind === "ready" ? current : { kind: "error", message: error instanceof Error ? error.message : "Couldn't load" });
    }
  }, [timeZone]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onVisible); };
  }, [load]);

  // Keep the display from sleeping while it is showing the dashboard.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try { lock = (await navigator.wakeLock?.request("screen")) ?? null; } catch { /* not supported or denied */ }
    };
    void request();
    const onVisible = () => { if (document.visibilityState === "visible") void request(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); void lock?.release(); };
  }, []);

  // Wander off to another tab and the screen finds its own way back to Home.
  useEffect(() => {
    if (tab === "home") return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastTouch.current > BACK_TO_HOME_MS) setTab("home");
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [tab]);

  const touch = () => { lastTouch.current = Date.now(); };

  if (state.kind === "loading") return <Notice title="Loading…"><p>Getting the house ready.</p></Notice>;
  if (state.kind === "needsPairing") return <PairingScreen initialMessage={state.message} onPaired={() => void load()} />;
  if (state.kind === "notConfigured") {
    return (
      <Notice title="This screen isn't set up yet">
        <p>Add a screen key to HomeHub, then reload this page.</p>
        <p>In Railway, add a variable named <strong>KIOSK_PAIRING_KEY</strong> with a long secret (16 or more characters).</p>
      </Notice>
    );
  }
  if (state.kind === "error") return <Notice title="Can't reach HomeHub"><p>{state.message}. Trying again in a minute.</p></Notice>;

  const hour = now.getHours();
  const isNight = hour >= 22 || hour < 6;
  if (isNight && now.getTime() > peekUntil) {
    return <NightClock now={now} onWake={() => setPeekUntil(Date.now() + NIGHT_PEEK_MS)} />;
  }

  const { summary } = state;
  return (
    <div className="flex h-screen select-none flex-col bg-background text-foreground" onPointerDown={touch}>
      <Header summary={summary} now={now} />
      {offline && (
        <p className="mx-8 mb-2 flex items-center gap-2 rounded-2xl bg-amber-100 px-5 py-2 text-lg font-semibold text-amber-900">
          <WifiOff className="h-5 w-5" /> Offline. Showing the last update.
        </p>
      )}
      <main className="flex-1 overflow-y-auto overscroll-contain px-8 pb-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tab === "home" && <HomeTab summary={summary} now={now} />}
        {tab === "calendar" && <CalendarTab summary={summary} />}
        {tab === "chores" && <ChoresTab summary={summary} />}
        {tab === "meals" && <MealsTab summary={summary} />}
      </main>
      <nav className="grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]" aria-label="Screens">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`flex min-h-24 flex-col items-center justify-center gap-1.5 text-lg font-bold transition-colors active:bg-muted ${tab === id ? "text-primary" : "text-muted-foreground"}`}
          >
            <Icon className="h-8 w-8" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
