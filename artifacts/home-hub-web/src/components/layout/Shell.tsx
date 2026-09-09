import { Link, useLocation } from "wouter";
import { Home, CheckSquare, Settings, Utensils, ChevronDown, Dumbbell, ArrowLeft, LogOut, BadgeDollarSign } from "lucide-react";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { useHomeHubSignOut } from "@/hooks/useHomeHubSignOut";
import {
  useGetFamilyMembers,
  getGetFamilyMembersQueryKey,
  useGetMe,
  getGetMeQueryKey,
  type HomeHubWebTab,
} from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { usePreferences } from "@/context/PreferencesContext";

const navItems = [
  { tab: "home" as const, href: "/",           label: "Home",       icon: Home },
  { tab: "tasks" as const, href: "/tasks",      label: "Tasks",      icon: CheckSquare },
  { tab: "tasks" as const, href: "/chores",     label: "Chores",     icon: BadgeDollarSign },
  { tab: "meals" as const, href: "/meals",      label: "Meals",      icon: Utensils },
  { tab: "workouts" as const, href: "/workouts",   label: "Workouts",   icon: Dumbbell },
  { tab: "settings" as const, href: "/settings",   label: "Settings",   icon: Settings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { activeMember, setActiveMember } = useActiveMember();
  const { preferences } = usePreferences();
  const { data: familyMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const signOut = useHomeHubSignOut();

  useEffect(() => {
    if (activeMember || !me?.linkedFamilyMemberId || !familyMembers?.length) return;
    const linkedMember = familyMembers.find(member => member.id === me.linkedFamilyMemberId);
    if (linkedMember) setActiveMember(linkedMember);
  }, [activeMember, familyMembers, me?.linkedFamilyMemberId, setActiveMember]);

  const handleSignOut = async () => {
    setMemberPickerOpen(false);
    await signOut();
  };

  const selectableMembers = familyMembers ?? [];
  const visibleTabs = new Set<HomeHubWebTab>(me?.visibleTabs ?? navItems.map(item => item.tab));
  const visibleNavItems = navItems.filter(item =>
    item.tab === "tasks"
      ? visibleTabs.has("tasks") || visibleTabs.has("properties")
      : visibleTabs.has(item.tab),
  );

  return (
    <div className={`h-[100dvh] min-h-0 flex flex-col md:flex-row bg-background overflow-hidden ${preferences.appearance.density === "compact" ? "density-compact" : ""}`}>

      {/* ── Desktop sidebar ── */}
      <aside className={`hidden md:flex w-64 h-[100dvh] sticky top-0 bg-card border-r border-border flex-col shadow-sm shrink-0 ${preferences.appearance.density === "compact" ? "p-3" : "p-4"}`}>
        <div className="flex items-center gap-3 px-2 mb-8 mt-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-serif font-bold text-xl shadow-md rotate-[-3deg]">
            H
          </div>
          <span className="text-2xl font-serif font-bold text-foreground">HomeHub</span>
        </div>

        <nav className="flex-1 space-y-1">
          {visibleNavItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 ${preferences.appearance.density === "compact" ? "py-2.5" : "py-3"} rounded-xl transition-all duration-200 font-medium ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          data-testid="button-sign-out-desktop"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col h-[100dvh] min-h-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className={`md:hidden flex items-center justify-between px-4 ${preferences.appearance.density === "compact" ? "py-2" : "py-3"} bg-card border-b border-border shrink-0`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-serif font-bold text-base shadow-sm rotate-[-3deg]">
              H
            </div>
            <span className="text-lg font-serif font-bold text-foreground">HomeHub</span>
          </div>

          {/* Member picker pill */}
          <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setMemberPickerOpen(v => !v)}
              data-testid="button-member-picker"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 border border-border/60 text-sm font-medium transition-colors active:bg-muted"
            >
              {activeMember ? (
                <>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                    style={{ backgroundColor: activeMember.color || "var(--color-primary)" }}
                  >
                    {activeMember.name.charAt(0)}
                  </div>
                  <span>{activeMember.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Who's here?</span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {memberPickerOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMemberPickerOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-40 bg-card border border-border rounded-2xl shadow-lg p-2 min-w-[160px]">
                  {selectableMembers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => { setActiveMember(member); setMemberPickerOpen(false); }}
                      className={`flex items-center gap-3 w-full p-2.5 rounded-xl transition-all text-left ${
                        activeMember?.id === member.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                        style={{ backgroundColor: member.color || "var(--color-primary)" }}
                      >
                        {member.name.charAt(0)}
                      </div>
                      <span className="font-medium text-sm">{member.name}</span>
                      {activeMember?.id === member.id && (
                        <div className="w-2 h-2 rounded-full bg-green-500 ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              aria-label="Sign out"
              title="Sign out"
              data-testid="button-sign-out-mobile"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/60 text-muted-foreground transition-colors active:bg-muted"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className={`flex-1 min-h-0 overflow-y-auto p-4 ${preferences.appearance.density === "compact" ? "md:p-5" : "md:p-8"}`}>
          <div className="max-w-6xl mx-auto">
            {location !== "/" && (
              <Link
                href="/"
                aria-label="Back to Home"
                className="mb-5 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Link>
            )}
            {children}
          </div>
          <div
            className={"h-[calc(6.5rem+env(safe-area-inset-bottom))] shrink-0 md:hidden"}
            aria-hidden="true"
          />
        </div>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className={`${"fixed inset-x-2"} z-40 flex items-stretch overflow-hidden rounded-2xl border border-border bg-card shadow-lg md:hidden`}
        style={{ bottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
        aria-label="Primary navigation"
      >
        {visibleNavItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.label.toLowerCase()}`}
                className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 ${preferences.appearance.density === "compact" ? "py-2 min-h-[56px]" : "py-3 min-h-[64px]"} transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className={`w-6 h-6 ${isActive ? "text-primary" : ""}`} />
              <span className="text-[9px] sm:text-[11px] font-semibold leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
