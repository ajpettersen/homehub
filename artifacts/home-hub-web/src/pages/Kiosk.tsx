import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays, Check, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun,
  Droplets, Home, ListChecks, Loader2, Moon, Sun, Sunrise, Sunset, UtensilsCrossed, Wind, Wrench, WifiOff,
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
  photoVersion: string | null;
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

const TONES = {
  primary: "bg-primary/12 text-primary",
  sky: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  green: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
};
type Tone = keyof typeof TONES;

function Card({ title, Icon, children, className = "", tone = "primary", aside }: {
  title: string; Icon: LucideIcon; children: React.ReactNode; className?: string; tone?: Tone; aside?: React.ReactNode;
}) {
  return (
    <section className={`rounded-[1.75rem] border border-border/70 bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)] ${className}`}>
      <h2 className="mb-4 flex items-center gap-3 text-base font-bold text-muted-foreground">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${TONES[tone]}`}><Icon className="h-5 w-5" /></span>
        <span className="flex-1 uppercase tracking-[0.12em]">{title}</span>
        {aside}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-xl text-muted-foreground">{children}</p>;
}

/** Lets a chore row check itself off; null where the screen can't (it never is today). */
const CompleteChoreContext = createContext<((id: string) => Promise<string | null>) | null>(null);
const CONFIRM_MS = 4_000;

function DoneButton({ chore }: { chore: KioskChore }) {
  const complete = useContext(CompleteChoreContext);
  const [step, setStep] = useState<"idle" | "confirm" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "confirm") return;
    const timer = window.setTimeout(() => setStep("idle"), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [step]);

  if (!complete || chore.awaitingApproval) return null;
  const onTap = async () => {
    if (step === "idle") { setError(null); setStep("confirm"); return; }
    if (step !== "confirm") return;
    setStep("saving");
    const problem = await complete(chore.id);
    if (problem) { setError(problem); setStep("idle"); }
  };
  return (
    <div className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        onClick={() => void onTap()}
        disabled={step === "saving"}
        aria-label={step === "confirm" ? `Confirm ${chore.title} is done` : `Mark ${chore.title} done`}
        className={`flex min-h-14 items-center gap-2 rounded-full px-4 text-lg font-bold transition-colors ${step === "idle"
          ? "border-2 border-emerald-500/40 text-emerald-700 active:bg-emerald-500/10 dark:text-emerald-400"
          : "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"}`}
      >
        {step === "saving" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6" />}
        {step === "idle" ? "Done" : step === "confirm" ? "Tap to confirm" : "Saving"}
      </button>
      {error && <p role="alert" className="mt-1 text-sm font-semibold text-destructive">{error}</p>}
    </div>
  );
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
      <span className="min-w-0 flex-1 text-xl font-semibold leading-snug">{chore.title}</span>
      {chore.awaitingApproval && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">Check pending</span>}
      {chore.isOverdue && <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-bold text-destructive">Overdue</span>}
      <DoneButton chore={chore} />
    </li>
  );
}

/** The first thing still to come today, or today's first all-day event. */
function nextEvent(events: KioskEvent[], now: Date): KioskEvent | null {
  return events.find(event => !event.allDay && new Date(event.end ?? event.start) > now)
    ?? events.find(event => event.allDay)
    ?? null;
}

function GlassChip({ Icon, label, children }: { Icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/20 bg-white/15 px-4 py-3 text-white shadow-lg shadow-black/10 backdrop-blur-xl">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">{label}</p>
        <p className="truncate text-xl font-semibold leading-tight">{children}</p>
      </div>
    </div>
  );
}

/**
 * The top of the Home tab: the house photo with the clock, weather and what's
 * next laid over it. With no photo yet, a sky that follows day and night.
 */
function Hero({ summary, now, todayEvents, dinner }: { summary: KioskSummary; now: Date; todayEvents: KioskEvent[]; dinner: KioskMeal | undefined }) {
  const { weather } = summary;
  const hour = now.getHours();
  const isDay = weather?.isDay ?? (hour >= 7 && hour < 19);
  const WeatherIcon = weather ? weatherIcon(weather.code, weather.isDay) : null;
  const upNext = nextEvent(todayEvents, now);
  const [time, meridiem] = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).split(" ");

  return (
    <section className="relative isolate flex min-h-[60vh] flex-col overflow-hidden rounded-[2.25rem] text-white shadow-2xl shadow-black/20">
      {summary.photoVersion ? (
        <img
          src={`/api/kiosk/photo?v=${encodeURIComponent(summary.photoVersion)}`}
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover motion-safe:animate-[kiosk-drift_60s_ease-in-out_infinite_alternate]"
        />
      ) : (
        <div className={`absolute inset-0 -z-20 ${isDay
          ? "bg-[radial-gradient(circle_at_80%_15%,#fff7d6_0,transparent_28%),linear-gradient(160deg,#6fb3e8_0%,#a9cfe9_45%,#f4c69a_100%)]"
          : "bg-[radial-gradient(circle_at_78%_18%,#f5f3e7_0,#f5f3e7_3%,transparent_3.5%),radial-gradient(circle_at_30%_110%,#7a4a7e_0,transparent_55%),linear-gradient(170deg,#0d1b3a_0%,#1f2a5c_55%,#3d2f5e_100%)]"}`}
        />
      )}
      {/* Shade the top and bottom so the text stays readable on any photo. */}
      <div className={`absolute inset-0 -z-10 bg-gradient-to-b ${isDay ? "from-black/45 via-black/5 to-black/60" : "from-black/60 via-black/25 to-black/75"}`} />

      <div className="flex items-start justify-between gap-6 p-8">
        <div className="[text-shadow:0_2px_16px_rgb(0_0_0/0.35)]">
          <p className="font-serif text-[7.5rem] font-semibold leading-[0.9] tracking-tight tabular-nums">
            {time}<span className="ml-3 text-4xl font-medium tracking-normal text-white/80">{meridiem}</span>
          </p>
          <p className="mt-4 text-2xl font-semibold text-white/90">
            {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        {weather && WeatherIcon && (
          <div className="rounded-3xl border border-white/20 bg-white/15 px-5 py-4 text-right backdrop-blur-xl">
            <div className="flex items-center justify-end gap-3">
              <WeatherIcon className="h-12 w-12" />
              <span className="font-serif text-6xl font-semibold tabular-nums">{weather.temperatureF}°</span>
            </div>
            <p className="mt-1 text-lg font-semibold">{weatherLabel(weather.code)}</p>
            <p className="text-base text-white/80">H {weather.highF}° · L {weather.lowF}°</p>
          </div>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3 p-6 pt-0">
        <GlassChip Icon={CalendarDays} label={upNext ? (upNext.allDay ? "Today" : `Next · ${eventTime(upNext)}`) : "Calendar"}>
          {upNext ? upNext.title : summary.calendar.configured ? "Nothing else today" : "No calendar yet"}
        </GlassChip>
        <GlassChip Icon={UtensilsCrossed} label="Dinner">
          {dinner ? dinner.meal : "Not planned yet"}
        </GlassChip>
      </div>
    </section>
  );
}

function WeatherStrip({ weather, today }: { weather: KioskWeather; today: string }) {
  const sunrise = clockTime(weather.sunrise);
  const sunset = clockTime(weather.sunset);
  return (
    <Card title="Forecast" Icon={CloudSun} tone="sky" className="col-span-2" aside={
      <span className="flex items-center gap-5 text-base font-semibold normal-case tracking-normal">
        <span className="flex items-center gap-1.5"><Wind className="h-4 w-4" />{weather.windMph} mph</span>
        <span className="flex items-center gap-1.5"><Droplets className="h-4 w-4" />{weather.rainChancePct}%</span>
        {sunrise && <span className="flex items-center gap-1.5"><Sunrise className="h-4 w-4" />{sunrise}</span>}
        {sunset && <span className="flex items-center gap-1.5"><Sunset className="h-4 w-4" />{sunset}</span>}
      </span>
    }>
      <ul className="grid grid-cols-5 gap-3 text-center">
        {weather.forecast.map(day => {
          const DayIcon = weatherIcon(day.code);
          const isToday = day.date === today;
          return (
            <li key={day.date} className={`rounded-2xl px-1 py-3 ${isToday ? "bg-sky-500/12 ring-1 ring-sky-500/30" : "bg-muted/60"}`}>
              <p className="text-lg font-bold">{isToday ? "Today" : new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</p>
              <DayIcon className="mx-auto my-2 h-9 w-9 text-sky-600 dark:text-sky-400" />
              <p className="text-xl font-bold tabular-nums">{day.highF}° <span className="font-medium text-muted-foreground">{day.lowF}°</span></p>
              <p className={`mt-1 text-base font-semibold tabular-nums ${day.rainChancePct >= 40 ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"}`}>
                <Droplets className="mr-0.5 inline h-3.5 w-3.5" />{day.rainChancePct}%
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-center text-lg text-muted-foreground">Feels like {weather.feelsLikeF}° right now</p>
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
  const count = (n: number) => <span className="rounded-full bg-muted px-3 py-0.5 text-base font-bold tabular-nums normal-case tracking-normal text-foreground">{n}</span>;

  return (
    <div className="space-y-5">
      <Hero summary={summary} now={now} todayEvents={todayEvents} dinner={todayMeals.find(meal => meal.mealType === "dinner")} />

      <div className="grid grid-cols-2 gap-5">
        <Card title="Today" Icon={CalendarDays} className="col-span-2" aside={todayEvents.length > 0 ? count(todayEvents.length) : undefined}>
          {!summary.calendar.configured ? (
            <Empty>No calendar connected yet.</Empty>
          ) : todayEvents.length === 0 ? (
            <Empty>Nothing scheduled today.</Empty>
          ) : (
            <ul className="space-y-2">
              {todayEvents.slice(0, 6).map(event => {
                const isPast = !event.allDay && new Date(event.end ?? event.start) <= now;
                return (
                  <li key={event.id} className={`flex items-center gap-4 rounded-2xl bg-muted/50 px-4 py-3 ${isPast ? "opacity-45" : ""}`}>
                    <span className="h-10 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="w-28 shrink-0 text-xl font-bold tabular-nums text-primary">{eventTime(event)}</span>
                    <span className="min-w-0 flex-1 text-2xl font-semibold leading-snug">{event.title}</span>
                  </li>
                );
              })}
              {todayEvents.length > 6 && <li className="px-4 text-lg text-muted-foreground">+ {todayEvents.length - 6} more</li>}
            </ul>
          )}
        </Card>

        <Card title="Chores" Icon={ListChecks} tone="green" className="col-span-2" aside={summary.chores.length > 0 ? count(summary.chores.length) : undefined}>
          {summary.chores.length === 0 ? <Empty>All caught up. 🎉</Empty> : (
            <ul className="divide-y divide-border">
              {summary.chores.slice(0, 5).map(chore => <ChoreRow key={chore.id} chore={chore} />)}
              {summary.chores.length > 5 && <li className="pt-3 text-lg text-muted-foreground">+ {summary.chores.length - 5} more in Chores</li>}
            </ul>
          )}
        </Card>

        <Card title="Meals" Icon={UtensilsCrossed} tone="amber" className="col-span-2">
          {todayMeals.length === 0 ? <Empty>No meals planned today.</Empty> : (
            <ul className="grid grid-cols-3 gap-4">
              {todayMeals.map(meal => (
                <li key={meal.id}>
                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-400">{meal.mealType}</p>
                  <p className="text-2xl font-semibold leading-snug">{meal.meal}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {summary.weather && <WeatherStrip weather={summary.weather} today={today} />}

        {urgentMaintenance.length > 0 && (
          <Card title="Home maintenance" Icon={Wrench} tone="violet" className="col-span-2">
            <ul className="space-y-3">
              {urgentMaintenance.map(task => (
                <li key={task.id} className="flex items-baseline gap-4">
                  <span className={`w-36 shrink-0 text-lg font-bold ${task.isOverdue ? "text-destructive" : "text-violet-600 dark:text-violet-400"}`}>
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
        <p className="rounded-2xl bg-amber-100 px-5 py-3 text-lg font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
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

  /** Checks a chore off, then refreshes. Returns a message if it didn't work. */
  const completeChore = useCallback(async (id: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/kiosk/chores/${encodeURIComponent(id)}/complete`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        await load();
        return body?.error ?? "Couldn't save that. Try again.";
      }
      await load();
      return null;
    } catch {
      return "No connection. Try again in a moment.";
    }
  }, [load]);

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
  // Light by day, dark from sunset to sunrise (by the clock if there's no weather).
  const isDark = summary.weather ? !summary.weather.isDay : hour < 7 || hour >= 19;
  return (
    <CompleteChoreContext.Provider value={completeChore}>
    <div className={`flex h-screen select-none flex-col bg-background text-foreground ${isDark ? "dark" : ""}`} onPointerDown={touch}>
      {tab !== "home" && <Header summary={summary} now={now} />}
      {offline && (
        <p className="mx-8 mb-2 flex items-center gap-2 rounded-2xl bg-amber-100 px-5 py-2 text-lg font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
          <WifiOff className="h-5 w-5" /> Offline. Showing the last update.
        </p>
      )}
      <main className={`flex-1 overflow-y-auto overscroll-contain px-6 pb-6 ${tab === "home" ? "pt-6" : "pt-2"} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
        {tab === "home" && <HomeTab summary={summary} now={now} />}
        {tab === "calendar" && <CalendarTab summary={summary} />}
        {tab === "chores" && <ChoresTab summary={summary} />}
        {tab === "meals" && <MealsTab summary={summary} />}
      </main>
      <nav className="mx-6 mb-[max(1.25rem,env(safe-area-inset-bottom))] grid grid-cols-4 gap-2 rounded-[2rem] border border-border/70 bg-card p-2 shadow-xl shadow-black/10" aria-label="Screens">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-[1.5rem] text-lg font-bold transition-colors ${tab === id ? "bg-primary text-primary-foreground shadow-md shadow-primary/30" : "text-muted-foreground active:bg-muted"}`}
          >
            <Icon className="h-7 w-7" />
            {label}
          </button>
        ))}
      </nav>
    </div>
    </CompleteChoreContext.Provider>
  );
}
