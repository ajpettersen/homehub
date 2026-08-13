import { Link, useLocation } from "wouter";
import { Home, CheckSquare, Wrench, Settings, Utensils, Brush, ChevronDown, Dumbbell, TreePine } from "lucide-react";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { useGetFamilyMembers, getGetFamilyMembersQueryKey } from "@workspace/api-client-react";
import { useState } from "react";

const navItems = [
  { href: "/",           label: "Home",       icon: Home },
  { href: "/chores",     label: "Chores",     icon: Brush },
  { href: "/meals",      label: "Meals",      icon: Utensils },
  { href: "/tasks",      label: "Tasks",      icon: CheckSquare },
  { href: "/workouts",   label: "Workouts",   icon: Dumbbell },
  { href: "/properties", label: "Properties", icon: TreePine },
  { href: "/settings",   label: "Settings",   icon: Settings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { activeMember, setActiveMember } = useActiveMember();
  const { data: familyMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);

  const humanMembers = familyMembers?.filter(m => m.role !== "pet") ?? [];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-64 bg-card border-r border-border flex-col p-4 min-h-[100dvh] shadow-sm shrink-0">
        <div className="flex items-center gap-3 px-2 mb-8 mt-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-serif font-bold text-xl shadow-md rotate-[-3deg]">
            H
          </div>
          <span className="text-2xl font-serif font-bold text-foreground">HomeHub</span>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
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

        {/* Who's Here */}
        <div className="mt-8 p-4 bg-muted/30 rounded-2xl border border-border/50">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
            Who's here?
          </label>
          <div className="flex flex-col gap-1">
            {familyMembers?.map(member => (
              <button
                key={member.id}
                onClick={() => setActiveMember(member)}
                className={`flex items-center gap-3 p-2 rounded-xl transition-all text-left ${
                  activeMember?.id === member.id
                    ? "bg-white shadow-sm border border-border"
                    : "hover:bg-black/5 border border-transparent"
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-inner shrink-0"
                  style={{ backgroundColor: member.color || "var(--color-primary)" }}
                >
                  {member.name.charAt(0)}
                </div>
                <span className="font-medium text-sm flex-1 truncate">{member.name}</span>
                {activeMember?.id === member.id && (
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-h-[100dvh] overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-serif font-bold text-base shadow-sm rotate-[-3deg]">
              H
            </div>
            <span className="text-lg font-serif font-bold text-foreground">HomeHub</span>
          </div>

          {/* Member picker pill */}
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
                  {humanMembers.map(member => (
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
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
