import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  useGetMe, getGetMeQueryKey,
  useUpdateHousehold, useCompleteOnboarding, useUpdateHouseholdTabVisibility,
  type HomeHubWebTab,
  getGetPropertiesQueryKey, getGetFamilyMembersQueryKey, getGetGroceryListsQueryKey,
  getGetChoresQueryKey, getGetMaintenanceTasksQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Home, Brush, Utensils, Mountain, CheckSquare, Dumbbell, UsersRound,
  Plus, Trash2, ArrowRight, ArrowLeft, Loader2, Check
} from "lucide-react";

// --- Types ---
type FamilyRole = "child" | "pet";
type PropertyType = "house" | "cabin";

interface OnboardingState {
  householdName: string;
  property: { name: string; type: PropertyType; address: string };
  familyMembers: Array<{ id: string; name: string; role: FamilyRole; color: string }>;
  modules: {
    chores: boolean;
    groceries: boolean;
    maintenance: boolean;
    tasks: boolean;
    workouts: boolean;
    people: boolean;
  };
  starter: { groceryListName: string; seedChores: boolean; seedMaintenance: boolean };
}

// --- Constants ---
const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", 
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"
];

const STARTER_CHORES = [
  { title: "Take out the trash", frequency: "weekly" as const },
  { title: "Vacuum the floors", frequency: "weekly" as const },
  { title: "Wipe down counters", frequency: "daily" as const }
];

const STARTER_MAINTENANCE = [
  { title: "Replace HVAC filter", category: "filter" as const, frequencyDays: 90 },
  { title: "Test smoke detectors", category: "seasonal" as const, frequencyDays: 180 },
  { title: "Clean gutters", category: "seasonal" as const, frequencyDays: 180 }
];

// --- Shared UI ---
const PrimaryButton = ({ children, disabled, onClick, testId, className = "", loading = false }: any) => (
  <button
    data-testid={testId}
    disabled={disabled || loading}
    onClick={onClick}
    className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-lg shadow-sm transition-all hover:bg-primary/90 hover:shadow disabled:opacity-50 disabled:pointer-events-none active:scale-95 ${className}`}
  >
    {loading && <Loader2 className="w-5 h-5 animate-spin" />}
    {children}
  </button>
);

const SecondaryButton = ({ children, disabled, onClick, testId, className = "" }: any) => (
  <button
    data-testid={testId}
    disabled={disabled}
    onClick={onClick}
    className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-muted text-foreground font-medium text-lg transition-all hover:bg-muted/80 disabled:opacity-50 disabled:pointer-events-none active:scale-95 ${className}`}
  >
    {children}
  </button>
);

const Checkbox = ({ checked, onChange, label }: any) => (
  <label className="flex items-center gap-3 cursor-pointer group p-2 -m-2 rounded-xl hover:bg-muted/50 transition-colors">
    <input type="checkbox" className="hidden" checked={checked} onChange={onChange} />
    <div className={`w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0 ${checked ? 'bg-primary text-primary-foreground' : 'bg-card border-2 border-border'}`}>
      {checked && <Check className="w-4 h-4" strokeWidth={3} />}
    </div>
    <span className="font-medium text-foreground select-none">{label}</span>
  </label>
);

const StepFooter = ({ onBack, onNext, isValid, isFirst = false, nextTestId = "onboarding-next" }: any) => (
  <div className="mt-12 flex justify-between items-center w-full">
    {isFirst ? <div /> : (
      <button 
        onClick={onBack} 
        data-testid="onboarding-back"
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium transition-colors px-2 py-2"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
    )}
    <PrimaryButton disabled={!isValid} onClick={onNext} testId={nextTestId}>
      Continue <ArrowRight className="ml-2 w-4 h-4" />
    </PrimaryButton>
  </div>
);

// --- Step Components ---

function StepHousehold({ state, update, onNext }: any) {
  return (
    <div className="w-full">
      <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center rotate-[-3deg] shadow-lg mb-8">
        <Home className="w-8 h-8" />
      </div>
      <h1 className="text-4xl md:text-5xl font-serif text-foreground font-bold mb-4 tracking-tight">
        Welcome home.
      </h1>
      <p className="text-xl text-muted-foreground mb-12">
        What should we call your household?
      </p>
      
      <input 
        type="text"
        autoFocus
        data-testid="onboarding-household-name"
        value={state.householdName}
        onChange={(e) => update({ householdName: e.target.value })}
        className="w-full text-3xl font-medium text-foreground bg-transparent border-b-2 border-border focus:border-primary focus:outline-none py-3 px-1 transition-colors"
        placeholder="e.g. The Smiths"
        onKeyDown={(e) => e.key === 'Enter' && state.householdName.trim().length > 0 && onNext()}
      />

      <StepFooter onNext={onNext} isFirst isValid={state.householdName.trim().length > 0} />
    </div>
  );
}

function StepProperty({ state, update, onNext, onBack }: any) {
  return (
    <div className="w-full">
      <h1 className="text-3xl md:text-4xl font-serif text-foreground font-bold mb-4">
        Tell us about your home.
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        We'll set up your first property. You can add more later.
      </p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Property Name
          </label>
          <input
            data-testid="onboarding-property-name"
            value={state.property.name}
            onChange={(e) => update({ property: { ...state.property, name: e.target.value } })}
            className="w-full text-xl font-medium text-foreground bg-card border-2 border-border focus:border-primary focus:outline-none rounded-xl py-3 px-4 transition-colors"
            placeholder="e.g. Main House"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Property Type
          </label>
          <div className="flex gap-4">
            {["house", "cabin"].map(type => (
              <button
                key={type}
                onClick={() => update({ property: { ...state.property, type: type as any } })}
                className={`flex-1 py-4 px-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${
                  state.property.type === type 
                    ? 'border-primary bg-primary/5 text-primary' 
                    : 'border-border bg-card text-muted-foreground hover:border-primary/50'
                }`}
              >
                {type === "house" ? <Home className="w-8 h-8" /> : <Mountain className="w-8 h-8" />}
                <span className="font-semibold capitalize">{type}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-baseline">
            Address <span className="text-muted-foreground/60 normal-case ml-2 font-medium">(Optional)</span>
          </label>
          <input
            value={state.property.address}
            onChange={(e) => update({ property: { ...state.property, address: e.target.value } })}
            className="w-full text-lg font-medium text-foreground bg-card border-2 border-border focus:border-primary focus:outline-none rounded-xl py-3 px-4 transition-colors"
            placeholder="e.g. 123 Main St, Springfield"
          />
        </div>
      </div>

      <StepFooter onBack={onBack} onNext={onNext} isValid={state.property.name.trim().length > 0} />
    </div>
  );
}

function StepFamily({ state, update, onNext, onBack }: any) {
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<FamilyRole>("child");
  const [newMemberColor, setNewMemberColor] = useState(COLORS[0]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const addMember = () => {
    if (!newMemberName.trim()) return;
    update({
      familyMembers: [...state.familyMembers, {
        id: Math.random().toString(36).slice(2),
        name: newMemberName.trim(),
        role: newMemberRole,
        color: newMemberColor
      }]
    });
    setNewMemberName("");
    setNewMemberColor(COLORS[(COLORS.indexOf(newMemberColor) + 1) % COLORS.length]);
    nameInputRef.current?.focus();
  };

  const removeMember = (id: string) => {
    update({ familyMembers: state.familyMembers.filter((m: any) => m.id !== id) });
  };

  return (
    <div className="w-full">
      <h1 className="text-3xl md:text-4xl font-serif text-foreground font-bold mb-4">
        Who's in your family?
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Add everyone who shares your home (pets included!).
      </p>

      <div className="space-y-3 mb-6">
        <AnimatePresence initial={false}>
          {state.familyMembers.map((member: any) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: "auto", scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              className="bg-card border border-border rounded-xl p-3 flex items-center justify-between shadow-sm overflow-hidden"
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: member.color }}
                >
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-foreground leading-tight">{member.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                </div>
              </div>
              <button 
                onClick={() => removeMember(member.id)}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="bg-muted/30 border border-border rounded-2xl p-5 shadow-sm space-y-5">
        <input
          ref={nameInputRef}
          data-testid="onboarding-member-name"
          value={newMemberName}
          onChange={e => setNewMemberName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addMember()}
          placeholder="Member's name"
          className="w-full text-xl font-medium bg-transparent border-b-2 border-border focus:border-primary focus:outline-none py-2 px-1 transition-colors"
        />

        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Role</label>
          <div className="flex gap-2">
            {(["child", "pet"] as const).map(role => (
              <button
                key={role}
                onClick={() => setNewMemberRole(role)}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-semibold capitalize transition-all ${
                  newMemberRole === role 
                    ? "bg-primary text-primary-foreground border-primary" 
                    : "bg-card text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Color</label>
          <div className="flex flex-wrap gap-3">
            {COLORS.map(color => (
              <button
                key={color}
                onClick={() => setNewMemberColor(color)}
                className="w-8 h-8 rounded-full transition-transform focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-background ring-primary relative"
                style={{ backgroundColor: color, transform: newMemberColor === color ? 'scale(1.2)' : 'scale(1)' }}
              >
                {newMemberColor === color && (
                  <div className="absolute inset-0 border-2 border-white rounded-full opacity-50" />
                )}
              </button>
            ))}
          </div>
        </div>

        <PrimaryButton 
          onClick={addMember} 
          disabled={!newMemberName.trim()} 
          className="w-full mt-2 py-2.5 text-base"
          testId="onboarding-add-member"
        >
          <Plus className="w-4 h-4 mr-1" /> Add Member
        </PrimaryButton>
      </div>

      <StepFooter 
        onBack={onBack} 
        onNext={onNext} 
        isValid={state.familyMembers.length > 0} 
      />
    </div>
  );
}

function ModuleCard({ title, icon, selected, onClick, desc }: any) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-5 rounded-2xl border-2 transition-all group relative overflow-hidden flex flex-col items-start ${
        selected 
          ? "border-primary bg-primary/5 shadow-sm" 
          : "border-border bg-card hover:border-primary/50"
      }`}
    >
      <div className={`mb-3 p-3 rounded-xl inline-block transition-colors ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:text-foreground'}`}>
        {icon}
      </div>
      <h3 className={`text-lg font-bold transition-colors ${selected ? 'text-primary' : 'text-foreground'}`}>{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 leading-snug">{desc}</p>
      
      {selected && (
        <div className="absolute top-4 right-4 text-primary animate-in zoom-in">
          <CheckSquare className="w-5 h-5" />
        </div>
      )}
    </button>
  );
}

function StepModules({ state, update, onNext, onBack }: any) {
  const toggle = (key: keyof OnboardingState["modules"]) => {
    update({ modules: { ...state.modules, [key]: !state.modules[key] } });
  };

  return (
    <div className="w-full">
      <h1 className="text-3xl md:text-4xl font-serif text-foreground font-bold mb-4">
        What do you want to manage first?
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Select the features you want to set up right now. You can always turn on the rest later.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <ModuleCard 
          title="Chores" 
          icon={<Brush className="w-6 h-6" />} 
          selected={state.modules.chores} 
          onClick={() => toggle("chores")}
          desc="Track daily & weekly tasks"
        />
        <ModuleCard 
          title="Groceries & Meals" 
          icon={<Utensils className="w-6 h-6" />} 
          selected={state.modules.groceries} 
          onClick={() => toggle("groceries")}
          desc="Meal planning and shopping lists"
        />
        <ModuleCard 
          title="Home Maintenance" 
          icon={<Mountain className="w-6 h-6" />} 
          selected={state.modules.maintenance} 
          onClick={() => toggle("maintenance")}
          desc="Long-term upkeep schedules"
        />
        <ModuleCard
          title="Shared Tasks"
          icon={<CheckSquare className="w-6 h-6" />}
          selected={state.modules.tasks}
          onClick={() => toggle("tasks")}
          desc="Lists, projects, and household to-dos"
        />
        <ModuleCard
          title="Workouts"
          icon={<Dumbbell className="w-6 h-6" />}
          selected={state.modules.workouts}
          onClick={() => toggle("workouts")}
          desc="Exercise plans for family members"
        />
        <ModuleCard
          title="People"
          icon={<UsersRound className="w-6 h-6" />}
          selected={state.modules.people}
          onClick={() => toggle("people")}
          desc="Family profiles and trusted contacts"
        />
      </div>

      <StepFooter onBack={onBack} onNext={onNext} isValid={true} />
    </div>
  );
}

function StepStarter({ state, update, onNext, onBack }: any) {
  return (
    <div className="w-full">
      <h1 className="text-3xl md:text-4xl font-serif text-foreground font-bold mb-4">
        Let's get you started.
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        We can seed your digital home with some basics so it's ready to use immediately.
      </p>

      <div className="space-y-4">
        {state.modules.groceries && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-sm">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 text-primary rounded-md"><Utensils className="w-4 h-4" /></div>
              Groceries
            </h3>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">First Shopping List Name</label>
              <input 
                value={state.starter.groceryListName}
                onChange={e => update({ starter: { ...state.starter, groceryListName: e.target.value } })}
                className="w-full text-lg font-medium text-foreground bg-transparent border-b-2 border-border focus:border-primary focus:outline-none py-1.5 transition-colors"
              />
            </div>
          </div>
        )}

        {state.modules.chores && (
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-foreground flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-primary/10 text-primary rounded-md"><Brush className="w-4 h-4" /></div>
              Chores
            </h3>
            <Checkbox 
              checked={state.starter.seedChores} 
              onChange={() => update({ starter: { ...state.starter, seedChores: !state.starter.seedChores } })} 
              label="Add sensible starter chores (Trash, Vacuum, etc.)"
            />
          </div>
        )}

        {state.modules.maintenance && (
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-foreground flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-primary/10 text-primary rounded-md"><Mountain className="w-4 h-4" /></div>
              Maintenance
            </h3>
            <Checkbox 
              checked={state.starter.seedMaintenance} 
              onChange={() => update({ starter: { ...state.starter, seedMaintenance: !state.starter.seedMaintenance } })} 
              label="Add basic schedule (HVAC filters, Detectors, etc.)"
            />
          </div>
        )}
      </div>

      <StepFooter onBack={onBack} onNext={onNext} isValid={true} />
    </div>
  );
}

function StepReview({ state, onBack, onFinish, isSubmitting, submitError, progressText }: any) {
  return (
    <div className="w-full">
      <h1 className="text-3xl md:text-4xl font-serif text-foreground font-bold mb-4">
        Ready to move in?
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Here's what we're setting up for you.
      </p>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm mb-12">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
            <Home className="w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-xl text-foreground">{state.householdName}</p>
            <p className="text-muted-foreground font-medium">{state.property.name} &bull; <span className="capitalize">{state.property.type}</span></p>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Family Members</p>
          <div className="flex flex-wrap gap-2">
            {state.familyMembers.map((m: any) => (
              <div key={m.id} className="flex items-center gap-2 bg-muted rounded-full pr-3 pl-1 py-1">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: m.color }}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium">{m.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Enabled Features</p>
          <div className="flex flex-wrap gap-2 text-sm font-medium text-foreground">
            {state.modules.chores && <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg">Chores</span>}
            {state.modules.groceries && <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg">Groceries</span>}
            {state.modules.maintenance && <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg">Maintenance</span>}
            {state.modules.tasks && <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg">Tasks</span>}
            {state.modules.workouts && <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg">Workouts</span>}
            {state.modules.people && <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg">People</span>}
            {!Object.values(state.modules).some(Boolean) && (
              <span className="text-muted-foreground">None selected.</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        {isSubmitting ? (
          <div className="text-center flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="font-medium text-foreground text-lg">{progressText}</p>
          </div>
        ) : (
          <div className="w-full space-y-4">
            {submitError && (
              <div className="p-4 bg-destructive/10 text-destructive rounded-xl w-full text-center font-medium animate-in shake">
                {submitError}
              </div>
            )}
            <div className="flex gap-4 w-full">
              <SecondaryButton onClick={onBack} className="flex-1">Back</SecondaryButton>
              <PrimaryButton onClick={onFinish} testId="onboarding-finish" className="flex-[2]">
                {submitError ? "Retry Setup" : "Finish Setup"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main Wizard Orchestrator ---

export default function Onboarding() {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const queryClient = useQueryClient();

  const [state, setState] = useState<OnboardingState>({
    householdName: "",
    property: { name: "", type: "house", address: "" },
    familyMembers: [],
    modules: {
      chores: true,
      groceries: true,
      maintenance: true,
      tasks: true,
      workouts: true,
      people: true,
    },
    starter: { groceryListName: "Groceries", seedChores: true, seedMaintenance: true }
  });

  useEffect(() => {
    if (me?.householdName && !state.householdName) {
      setState(s => ({ ...s, householdName: me.householdName! }));
    }
  }, [me, state.householdName]);

  const update = (partial: Partial<OnboardingState>) => setState(s => ({ ...s, ...partial }));

  const [[page, direction], setPage] = useState([0, 0]);

  const next = useCallback(() => {
    let nextPage = page + 1;
    // Skip starter step if no modules selected
    if (page === 3) {
      if (!state.modules.chores && !state.modules.groceries && !state.modules.maintenance) {
        nextPage = 5;
      }
    }
    setPage([nextPage, 1]);
  }, [page, state.modules]);

  const back = useCallback(() => {
    let prevPage = page - 1;
    if (page === 5) {
      if (!state.modules.chores && !state.modules.groceries && !state.modules.maintenance) {
        prevPage = 3;
      }
    }
    setPage([prevPage, -1]);
  }, [page, state.modules]);

  // Mutations
  const updateHouseholdMutation = useUpdateHousehold();
  const completeOnboardingMutation = useCompleteOnboarding();
  const updateTabVisibilityMutation = useUpdateHouseholdTabVisibility();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState("");

  const executeSetup = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const visibleTabs: HomeHubWebTab[] = [
        "home",
        ...(state.modules.maintenance ? ["properties" as const] : []),
        ...(state.modules.chores ? ["chores" as const] : []),
        ...(state.modules.groceries ? ["meals" as const] : []),
        ...(state.modules.tasks ? ["tasks" as const] : []),
        ...(state.modules.workouts ? ["workouts" as const] : []),
        ...(state.modules.people ? ["people" as const] : []),
        "settings",
      ];
      await updateTabVisibilityMutation.mutateAsync({ data: { visibleTabs } });

      // One transactional, idempotent request seeds everything server-side:
      // either it all commits (including the completion flag) or nothing does,
      // so retrying after a failure can never create duplicates.
      setProgressText("Setting up your home...");
      await completeOnboardingMutation.mutateAsync({
        data: {
          householdName: state.householdName,
          property: {
            name: state.property.name,
            type: state.property.type,
            address: state.property.address || null,
          },
          familyMembers: state.familyMembers.map((member) => ({
            name: member.name,
            role: member.role,
            color: member.color,
          })),
          groceryListName: state.modules.groceries ? state.starter.groceryListName : null,
          chores: state.modules.chores && state.starter.seedChores ? STARTER_CHORES : [],
          maintenanceTasks:
            state.modules.maintenance && state.starter.seedMaintenance ? STARTER_MAINTENANCE : [],
        },
      });

      setProgressText("Warming things up...");
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetPropertiesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() });
      
      // Completion naturally flows as the gate in App.tsx detects onboardingCompleted: true
    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message || "An error occurred during setup.");
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (confirm("Are you sure you want to skip setup? You can manually add everything later, but the automated setup won't be available again.")) {
      setIsSubmitting(true);
      try {
        await updateHouseholdMutation.mutateAsync({ data: { onboardingCompleted: true } });
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      } catch (err) {
        alert("Failed to skip setup.");
        setIsSubmitting(false);
      }
    }
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0,
      scale: 0.98
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 50 : -50,
      opacity: 0,
      scale: 0.98
    })
  };

  const content = useMemo(() => {
    switch (page) {
      case 0: return <StepHousehold state={state} update={update} onNext={next} />;
      case 1: return <StepProperty state={state} update={update} onNext={next} onBack={back} />;
      case 2: return <StepFamily state={state} update={update} onNext={next} onBack={back} />;
      case 3: return <StepModules state={state} update={update} onNext={next} onBack={back} />;
      case 4: return <StepStarter state={state} update={update} onNext={next} onBack={back} />;
      case 5: return <StepReview state={state} onBack={back} onFinish={executeSetup} isSubmitting={isSubmitting} submitError={submitError} progressText={progressText} />;
      default: return null;
    }
  }, [page, state, next, back, isSubmitting, submitError, progressText]);

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans overflow-hidden">
      <header className="p-6 flex justify-end shrink-0 relative z-10">
        {!isSubmitting && (
          <button 
            data-testid="onboarding-skip"
            onClick={handleSkip}
            className="text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-full hover:bg-muted/50"
          >
            Skip Setup
          </button>
        )}
      </header>
      
      <main className="flex-1 flex flex-col items-center pt-4 px-6 pb-24 overflow-y-auto overflow-x-hidden relative">
        <div className="w-full max-w-xl mx-auto flex-1 flex flex-col justify-center">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={page}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="w-full"
            >
              {content}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 h-1.5 bg-muted z-20">
        <div 
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${((page + 1) / 6) * 100}%` }}
        />
      </div>
    </div>
  );
}
