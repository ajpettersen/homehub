import React, { useState, useMemo } from "react";
import {
  useGetChores, getGetChoresQueryKey,
  useCompleteChore,
  useCreateChore,
  useUpdateChore,
  useDeleteChore,
  useApproveChore,
  useRejectChore,
  getGetDashboardQueryKey,
  useGetProperties, getGetPropertiesQueryKey,
  useGetFamilyMembers, getGetFamilyMembersQueryKey,
  useGetWallets, getGetWalletsQueryKey,
  useCreateWalletTransaction,
  Chore,
  ChildWallet
} from "@workspace/api-client-react";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { usePreferences } from "@/context/PreferencesContext";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Trash2, X, Check, Home, CalendarClock, CreditCard, ChevronRight, AlertCircle, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { addDays, isToday, parseISO } from "date-fns";
import { formatDateOnly, getLocalDateOnly } from "@/lib/dateOnly";

// ── types ─────────────────────────────────────────────────────────────────────

type Frequency = "daily" | "weekly" | "biweekly" | "monthly" | "custom";
const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily",     label: "Daily" },
  { value: "weekly",    label: "Weekly" },
  { value: "biweekly",  label: "Bi-weekly" },
  { value: "monthly",   label: "Monthly" },
];

// ── utility ───────────────────────────────────────────────────────────────────

function formatMoney(cents: number) {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

// ── chore card ────────────────────────────────────────────────────────────────

function ChoreCard({
  chore,
  onComplete,
  onDelete,
  onUpdateDueDate,
  onApprove,
  onReject,
  updating,
  error,
  members,
  isParent,
}: {
  chore: Chore;
  onComplete: () => void;
  onDelete: () => void;
  onUpdateDueDate: (dueDate: string) => void;
  onApprove: () => void;
  onReject: () => void;
  updating: boolean;
  error: string | null;
  members: any[];
  isParent: boolean;
}) {
  const [pickedDate, setPickedDate] = useState(chore.dueDate ?? getLocalDateOnly());
  const isDone = chore.status === "approved";
  const isPending = chore.status === "pending";
  const overdue = chore.status === "open" && chore.isOverdue;
  const dueToday = chore.status === "open" && chore.dueDate && isToday(parseISO(chore.dueDate));
  const hasReward = chore.rewardCents > 0;

  const assignee = members.find(m => m.id === chore.assigneeId);

  const urgency = isPending
    ? "border-primary/50 bg-primary/5"
    : overdue
    ? "border-destructive/40 bg-destructive/5"
    : dueToday
    ? "border-accent/60 bg-accent/5"
    : isDone
    ? "border-border/30 bg-muted/20 opacity-60 hover:opacity-100"
    : "border-border bg-card";

  const snoozeByDays = (days: number) => {
    const dueDate = getLocalDateOnly(addDays(new Date(), days));
    setPickedDate(dueDate);
    onUpdateDueDate(dueDate);
  };

  return (
    <div className={`group rounded-3xl border-2 transition-all shadow-sm hover:shadow-md ${urgency} overflow-hidden flex flex-col`}>
      <div className="flex items-start gap-4 p-5">

        {/* Action Button / Status Icon */}
        <div className="pt-0.5 shrink-0">
          {!isDone && !isPending && (
            <button
              onClick={onComplete}
              disabled={updating}
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:opacity-50 ${
                overdue
                  ? "border-destructive/50 hover:bg-destructive/10 text-transparent hover:text-destructive"
                  : "border-muted-foreground/30 hover:border-primary hover:bg-primary/10 text-transparent hover:text-primary"
              }`}
              aria-label="Complete chore"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
          {isDone && (
            <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
              <Check className="w-4 h-4 text-white" />
            </div>
          )}
          {isPending && (
            <div className="w-7 h-7 rounded-full border-2 border-primary border-dashed flex items-center justify-center animate-[spin_4s_linear_infinite]">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className={`font-bold text-lg leading-snug ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {chore.title}
            </h3>
            {/* Right side badges / Delete */}
            <div className="flex items-center gap-2 shrink-0">
              {assignee && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm"
                  style={{ backgroundColor: assignee.color || "var(--color-primary)" }}
                  title={assignee.name}
                >
                  {assignee.name.charAt(0)}
                </div>
              )}
              <button
                onClick={onDelete}
                disabled={updating}
                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                aria-label="Delete chore"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-muted-foreground font-medium">
            <span className="capitalize bg-muted px-2 py-0.5 rounded-md text-xs">{chore.frequency}</span>
            {chore.dueDate && (
              <span className={`flex items-center gap-1.5 ${overdue ? "text-destructive font-bold" : dueToday ? "text-accent-foreground font-bold" : ""}`}>
                <CalendarClock className="w-3.5 h-3.5" />
                {overdue ? "Overdue" : dueToday ? "Due today" : `Due ${formatDateOnly(chore.dueDate, "MMM d")}`}
              </span>
            )}
            {chore.propertyName && (
              <span className="flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5" />{chore.propertyName}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {hasReward && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold shadow-sm">
                <CreditCard className="w-3.5 h-3.5" /> {formatMoney(chore.rewardCents)}
              </span>
            )}
            {isPending && !isParent && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold">
                <Clock className="w-3.5 h-3.5" /> Awaiting Approval
              </span>
            )}
            {isDone && chore.completedBy && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-bold">
                <CheckCircle className="w-3.5 h-3.5" /> Done by {chore.completedBy}
              </span>
            )}
          </div>

          {/* Bundles */}
          {chore.bundleItems && chore.bundleItems.length > 0 && (
            <div className="mt-4 space-y-2">
              {chore.bundleItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? "bg-muted-foreground" : "bg-primary/60"}`} />
                  <span className={`${isDone ? "line-through text-muted-foreground" : "text-foreground font-medium"}`}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Parent Approval Actions */}
          {isPending && isParent && (
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={onApprove}
                disabled={updating}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors shadow-md hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Approve & Pay
              </button>
              <button
                onClick={onReject}
                disabled={updating}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-foreground font-bold hover:bg-muted-foreground/10 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" /> Reject
              </button>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 flex items-center gap-2 text-sm font-semibold text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Snooze Bar */}
      {chore.status === "open" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 px-5 py-3 bg-muted/10">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mr-2">Snooze</span>
          <button
            type="button"
            onClick={() => snoozeByDays(1)}
            disabled={updating}
            className="rounded-lg border-2 border-transparent bg-muted px-3 py-1.5 text-xs font-bold text-foreground hover:bg-background hover:border-border transition-all disabled:opacity-50"
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={() => snoozeByDays(7)}
            disabled={updating}
            className="rounded-lg border-2 border-transparent bg-muted px-3 py-1.5 text-xs font-bold text-foreground hover:bg-background hover:border-border transition-all disabled:opacity-50"
          >
            Next week
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`chore-due-date-${chore.id}`}>Due date</label>
            <input
              id={`chore-due-date-${chore.id}`}
              type="date"
              value={pickedDate}
              onChange={event => setPickedDate(event.target.value)}
              className="rounded-lg border-2 border-border bg-background px-2.5 py-1.5 text-xs font-medium focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => pickedDate && onUpdateDueDate(pickedDate)}
              disabled={!pickedDate || updating || pickedDate === chore.dueDate}
              className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-bold text-background disabled:opacity-50 transition-colors hover:bg-foreground/90"
            >
              Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── add chore form ────────────────────────────────────────────────────────────

function AddChoreForm({
  properties,
  members,
  onSubmit,
  onCancel,
  saving,
  createError,
}: {
  properties: any[];
  members: any[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
  createError?: string | null;
}) {
  const [title, setTitle] = useState("");
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [assigneeId, setAssigneeId] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");
  const [bundleItems, setBundleItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [formError, setFormError] = useState("");
  const isPaid = Number(rewardAmount) > 0;
  const eligibleAssignees = isPaid ? members.filter(member => member.role === "child") : members;

  React.useEffect(() => {
    if (isPaid && !eligibleAssignees.some(member => String(member.id) === String(assigneeId))) {
      setAssigneeId("");
    }
  }, [isPaid, assigneeId, eligibleAssignees]);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!title.trim() || !propertyId) return;

    let rewardCents = 0;
    if (rewardAmount) {
      const parsed = parseFloat(rewardAmount);
      if (!isNaN(parsed) && parsed > 0) {
        rewardCents = Math.round(parsed * 100);
      }
    }
    if (rewardCents > 0 && !assigneeId) {
      setFormError("Choose which child can earn this reward.");
      return;
    }

    onSubmit({
      title: title.trim(),
      propertyId,
      frequency,
      assigneeId: assigneeId || null,
      points: 0,
      rewardCents,
      bundleItems: bundleItems.length > 0 ? bundleItems : undefined
    });
  };

  const addBundleItem = () => {
    if (newItem.trim()) {
      setBundleItems([...bundleItems, newItem.trim()]);
      setNewItem("");
    }
  };

  const removeBundleItem = (index: number) => {
    setBundleItems(bundleItems.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-foreground/20 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-card w-full max-w-lg rounded-[2rem] shadow-2xl border-2 border-border overflow-hidden flex flex-col max-h-full animate-in zoom-in-95 duration-300">
        <div className="px-6 py-5 border-b border-border/50 flex items-center justify-between bg-muted/30">
          <h2 className="font-serif text-2xl font-bold text-foreground">New Chore</h2>
          <button onClick={onCancel} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handle} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">What needs to be done?</label>
            <input
              autoFocus
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 font-medium text-lg focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground/50"
              placeholder="e.g. Clean the kitchen"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Property */}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Property</label>
              <select
                value={propertyId}
                onChange={e => setPropertyId(e.target.value)}
                className="w-full bg-background border-2 border-border rounded-xl px-3 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                required
              >
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Assignee */}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Assign to</label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full bg-background border-2 border-border rounded-xl px-3 py-3 text-sm font-medium focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                required={isPaid}
              >
                <option value="">{isPaid ? "Choose a child" : "Anyone"}</option>
                {eligibleAssignees.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          {/* Reward */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Allowance Reward (Optional)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-lg">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rewardAmount}
                onChange={e => setRewardAmount(e.target.value)}
                className="w-full bg-background border-2 border-border rounded-xl pl-8 pr-4 py-3 font-medium focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Checklist Bundles */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Checklist Items (Optional)</label>
            <div className="space-y-3">
              {bundleItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-xl border border-border/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                  <span className="flex-1 text-sm font-medium text-foreground">{item}</span>
                  <button type="button" onClick={() => removeBundleItem(i)} className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newItem}
                  onChange={e => setNewItem(e.target.value)}
                  onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); addBundleItem(); } }}
                  placeholder="Add an item to the bundle..."
                  className="flex-1 bg-background border-2 border-border rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-primary transition-all"
                />
                <button
                  type="button"
                  onClick={addBundleItem}
                  disabled={!newItem.trim()}
                  className="px-4 py-2 rounded-xl bg-muted text-foreground font-bold text-sm hover:bg-foreground hover:text-background transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">Repeats</label>
            <div className="flex gap-2 flex-wrap">
              {FREQUENCIES.map(f => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFrequency(f.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border-2 ${
                    frequency === f.value
                      ? "bg-foreground text-background border-foreground shadow-md"
                      : "border-border text-muted-foreground hover:border-foreground/40 bg-background"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {formError && <p role="alert" className="text-sm font-semibold text-destructive">{formError}</p>}
          {createError && <p role="alert" className="text-sm font-semibold text-destructive">{createError}</p>}
        </form>

        <div className="p-5 border-t border-border/50 bg-muted/30 flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-3.5 font-bold rounded-xl border-2 border-border text-foreground hover:bg-background transition-colors flex items-center justify-center gap-2">
            Cancel
          </button>
          <button type="submit" onClick={handle} disabled={saving} className="flex-[2] py-3.5 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? "Saving…" : "Create Chore"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── wallet transaction modal ───────────────────────────────────────────────────

function WalletTransactionModal({
  wallet,
  onClose,
  onSave,
  saving,
  saveError
}: {
  wallet: ChildWallet;
  onClose: () => void;
  onSave: (amountCents: number, description: string) => void;
  saving: boolean;
  saveError?: string | null;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isAdd, setIsAdd] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || !description.trim()) return;
    const cents = Math.round(parsed * 100);
    onSave(isAdd ? cents : -cents, description.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-sm rounded-[2rem] shadow-2xl border-2 border-border p-6 animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-xl font-bold text-foreground">Adjust Allowance</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex p-1 bg-muted rounded-xl gap-1 border border-border/50">
            <button
              type="button"
              onClick={() => setIsAdd(true)}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${isAdd ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Add Funds
            </button>
            <button
              type="button"
              onClick={() => setIsAdd(false)}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${!isAdd ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Deduct
            </button>
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-lg">$</span>
              <input
                autoFocus
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-background border-2 border-border rounded-xl pl-8 pr-4 py-3 font-bold text-lg focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Reason</label>
            <input
              type="text"
              required
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
              placeholder={isAdd ? "e.g. Good grades" : "e.g. Bought a toy"}
            />
          </div>

          {saveError && <p role="alert" className="text-sm font-semibold text-destructive">{saveError}</p>}

          <button type="submit" disabled={saving} className="w-full py-3.5 font-bold rounded-xl bg-foreground text-background hover:bg-foreground/90 transition-all shadow-md mt-4 disabled:opacity-50">
            {saving ? "Saving..." : "Confirm"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Chores() {
  const queryClient = useQueryClient();
  const { activeMember } = useActiveMember();
  const { preferences } = usePreferences();

  const isParent = activeMember?.role === "parent";

  const { data: chores, isLoading } = useGetChores({}, { query: { queryKey: getGetChoresQueryKey() } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  const { data: members } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { data: wallets, isLoading: walletsLoading, isError: walletsError, refetch: refetchWallets } = useGetWallets({ query: { queryKey: getGetWalletsQueryKey() } });

  const completeChore = useCompleteChore();
  const createChore = useCreateChore();
  const updateChore = useUpdateChore();
  const deleteChore = useDeleteChore();
  const approveChore = useApproveChore();
  const rejectChore = useRejectChore();
  const createWalletTx = useCreateWalletTransaction();

  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine" | "today" | "pending" | "done">(() => preferences.tabs.chores.defaultFilter);
  const [transactWallet, setTransactWallet] = useState<ChildWallet | null>(null);
  const [deletingChore, setDeletingChore] = useState<{ id: string; title: string } | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const clearError = (id: string) => {
    setActionErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const invalidateChores = () => {
    queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const invalidateWallets = () => {
    queryClient.invalidateQueries({ queryKey: getGetWalletsQueryKey() });
  };

  const handleComplete = (id: string) => {
    clearError(id);
    completeChore.mutate(
      { id, data: { completedBy: activeMember?.name ?? "Someone" } },
      {
        onSuccess: invalidateChores,
        onError: () => setActionErrors(prev => ({ ...prev, [id]: "Failed to complete chore. Please try again." }))
      }
    );
  };

  const handleDelete = (chore: Chore) => {
    deleteChore.reset();
    setDeletingChore({ id: chore.id, title: chore.title });
  };

  const handleUpdateDueDate = (id: string, dueDate: string) => {
    clearError(id);
    updateChore.mutate(
      { id, data: { dueDate } },
      {
        onSuccess: invalidateChores,
        onError: () => setActionErrors(prev => ({ ...prev, [id]: "Failed to update due date." }))
      }
    );
  };

  const handleCreate = (data: any) => {
    setActionErrors(prev => ({ ...prev, "create": "" }));
    createChore.mutate({ data }, {
      onSuccess: () => { setAdding(false); invalidateChores(); },
      onError: () => setActionErrors(prev => ({ ...prev, "create": "Failed to create chore." }))
    });
  };

  const handleApprove = (id: string) => {
    clearError(id);
    approveChore.mutate({ id }, {
      onSuccess: () => { invalidateChores(); invalidateWallets(); },
      onError: () => setActionErrors(prev => ({ ...prev, [id]: "Failed to approve chore." }))
    });
  };

  const handleReject = (id: string) => {
    clearError(id);
    rejectChore.mutate({ id }, {
      onSuccess: invalidateChores,
      onError: () => setActionErrors(prev => ({ ...prev, [id]: "Failed to reject chore." }))
    });
  };

  const handleWalletTx = (amountCents: number, description: string) => {
    if (!transactWallet) return;
    setActionErrors(prev => ({ ...prev, "wallet": "" }));
    createWalletTx.mutate({
      memberId: transactWallet.memberId,
      data: {
        amountCents,
        description,
        type: amountCents > 0 ? "manual_credit" : "manual_debit"
      }
    }, {
      onSuccess: () => { setTransactWallet(null); invalidateWallets(); },
      onError: () => setActionErrors(prev => ({ ...prev, "wallet": "Failed to update allowance." }))
    });
  };

  // Filtering
  const today = getLocalDateOnly();

  const filteredChores = useMemo(() => {
    if (!chores) return [];
    return chores.filter(c => {
      if (filter === "mine") return c.assigneeId === activeMember?.id;
      if (filter === "today") return c.status === "open" && c.dueDate === today;
      if (filter === "pending") return c.status === "pending";
      if (filter === "done") return c.status === "approved";
      if (filter === "all") return c.status !== "approved"; // hide done from all
      return true;
    });
  }, [chores, filter, activeMember?.id, today]);

  // Grouping for "All" or "Mine" views
  const pendingGroup = filteredChores.filter(c => c.status === "pending");
  const overdueGroup = filteredChores.filter(c => c.status === "open" && c.isOverdue);
  const dueTodayGroup = filteredChores.filter(c => c.status === "open" && !c.isOverdue && c.dueDate === today);
  const upcomingGroup = filteredChores.filter(c => c.status === "open" && !c.isOverdue && c.dueDate !== today);
  const doneGroup = filter === "done" ? filteredChores : [];

  const totalPending = (chores ?? []).filter(c => c.status === "pending").length;
  const totalOpen = (chores ?? []).filter(c => c.status === "open").length;

  const displayWallets = useMemo(() => {
    if (!wallets) return [];
    if (isParent) return wallets;
    return wallets.filter(w => w.memberId === activeMember?.id);
  }, [wallets, isParent, activeMember?.id]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 bg-card border-2 border-border p-6 rounded-[2rem] shadow-sm">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground tracking-tight">Chores & Allowances</h1>
          <p className="text-muted-foreground mt-2 font-medium text-lg flex flex-wrap items-center gap-3">
            {totalOpen > 0 ? <span className="flex items-center gap-1.5"><Clock className="w-5 h-5 text-accent-foreground" /> {totalOpen} open tasks</span> : "All caught up on chores!"}
            {totalPending > 0 && <span className="flex items-center gap-1.5 text-primary"><AlertCircle className="w-5 h-5" /> {totalPending} to approve</span>}
          </p>
        </div>

        <button
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-foreground text-background font-bold hover:bg-foreground/90 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 shrink-0"
        >
          <Plus className="w-5 h-5" /> New Chore
        </button>
      </div>

      {/* Top Section: Wallets */}
      <section className="space-y-5 pt-2">
        <h2 className="font-serif text-2xl font-bold text-foreground pl-2">
          {isParent ? "Kids' Wallets" : "My Wallet"}
        </h2>

        {walletsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => <div key={i} className="h-36 bg-muted rounded-3xl animate-pulse" />)}
          </div>
        ) : walletsError ? (
          <div className="bg-destructive/10 border-2 border-destructive/20 rounded-3xl p-6 text-center shadow-sm">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
            <h3 className="font-bold text-foreground text-lg mb-1">Couldn't load wallets</h3>
            <p className="text-sm text-muted-foreground mb-4">There was a problem fetching the wallet balances.</p>
            <button onClick={() => refetchWallets()} className="px-5 py-2.5 bg-background border-2 border-border rounded-xl text-sm font-bold hover:bg-muted transition-colors">
              Retry
            </button>
          </div>
        ) : displayWallets.length === 0 ? (
          <div className="bg-card border-2 border-dashed border-border/60 rounded-3xl p-8 text-center shadow-sm">
            <p className="text-muted-foreground text-sm font-medium">No child wallets available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayWallets.map(wallet => (
              <div key={wallet.memberId} className="bg-card border-2 border-border rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm"
                      style={{ backgroundColor: wallet.memberColor }}
                    >
                      {wallet.memberName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-base leading-tight mb-0.5">{wallet.memberName}</h3>
                      <p className="text-xl font-serif text-primary font-bold tracking-tight leading-none">
                        {formatMoney(wallet.balanceCents)}
                      </p>
                    </div>
                  </div>
                  {isParent && (
                    <button
                      onClick={() => setTransactWallet(wallet)}
                      className="px-3.5 py-2 rounded-xl bg-muted text-foreground text-xs font-bold hover:bg-foreground hover:text-background transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    >
                      Adjust
                    </button>
                  )}
                </div>

                <div className="pt-3 border-t border-border/50">
                  {wallet.recentTransactions.length > 0 ? (
                    <div className="space-y-1.5">
                      {wallet.recentTransactions.slice(0, 2).map(tx => (
                        <div key={tx.id} className="flex items-start justify-between text-xs gap-2">
                          <span className="text-muted-foreground font-medium truncate flex-1" title={tx.description}>
                            {tx.description}
                          </span>
                          <span className={`font-bold shrink-0 tabular-nums ${tx.amountCents > 0 ? "text-green-600 dark:text-green-400" : tx.amountCents < 0 ? "text-foreground" : "text-muted-foreground"}`}>
                            {tx.amountCents > 0 ? "+" : ""}{formatMoney(tx.amountCents)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground italic">
                      No recent history.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="space-y-8">

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap bg-muted/30 rounded-2xl p-2 w-fit border border-border/50">
          {[
              { key: "all",     label: "All Open" },
              { key: "mine",    label: "My Chores" },
              { key: "today",   label: "Today" },
              { key: "pending", label: "Needs Approval", badge: totalPending > 0 ? totalPending : undefined },
              { key: "done",    label: "Done" },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key as any)}
                className={`relative px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                  filter === f.key
                    ? "bg-background shadow-md text-foreground border-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent"
                } border`}
              >
                {f.label}
                {f.badge !== undefined && (
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${filter === f.key ? 'bg-primary text-white' : 'bg-primary/20 text-primary'}`}>
                    {f.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <div key={i} className="h-32 bg-muted rounded-[2rem] animate-pulse" />)}
            </div>
          ) : filteredChores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-border/60 rounded-[3rem] bg-card text-center px-6 shadow-sm">
              <CheckCircle2 className="w-16 h-16 text-primary/30 mb-4" />
              <p className="font-serif font-bold text-2xl mb-2 text-foreground">
                {filter === "done" ? "No completed chores yet" : filter === "pending" ? "Nothing waiting for approval" : "All clear!"}
              </p>
              <p className="text-muted-foreground text-base max-w-sm">
                {filter === "done"
                  ? "When chores are marked complete, they'll appear here."
                  : filter === "pending"
                  ? "Chores with an allowance reward will land here for you to approve."
                  : "Enjoy the break, or add a new chore for the family."}
              </p>
            </div>
          ) : (
            <div className="space-y-10">

              {pendingGroup.length > 0 && (
                <section>
                  <h2 className="text-sm font-bold text-primary uppercase tracking-widest mb-4 flex items-center gap-2 pl-2">
                    <AlertCircle className="w-4 h-4" /> Needs Approval ({pendingGroup.length})
                  </h2>
                  <div className="space-y-3">
                    {pendingGroup.map(c => (
                      <ChoreCard key={c.id} chore={c} members={members ?? []} isParent={isParent} error={actionErrors[c.id] || null} onComplete={() => handleComplete(c.id)} onDelete={() => handleDelete(c)} onUpdateDueDate={dueDate => handleUpdateDueDate(c.id, dueDate)} onApprove={() => handleApprove(c.id)} onReject={() => handleReject(c.id)} updating={updateChore.isPending || completeChore.isPending || approveChore.isPending || rejectChore.isPending} />
                    ))}
                  </div>
                </section>
              )}

              {overdueGroup.length > 0 && (
                <section>
                  <h2 className="text-sm font-bold text-destructive uppercase tracking-widest mb-4 flex items-center gap-2 pl-2">
                    <AlertTriangle className="h-4 w-4" /> Overdue ({overdueGroup.length})
                  </h2>
                  <div className="space-y-3">
                    {overdueGroup.map(c => (
                      <ChoreCard key={c.id} chore={c} members={members ?? []} isParent={isParent} error={actionErrors[c.id] || null} onComplete={() => handleComplete(c.id)} onDelete={() => handleDelete(c)} onUpdateDueDate={dueDate => handleUpdateDueDate(c.id, dueDate)} onApprove={() => handleApprove(c.id)} onReject={() => handleReject(c.id)} updating={updateChore.isPending || completeChore.isPending || approveChore.isPending || rejectChore.isPending} />
                    ))}
                  </div>
                </section>
              )}

              {dueTodayGroup.length > 0 && (
                <section>
                  <h2 className="text-sm font-bold text-accent-foreground uppercase tracking-widest mb-4 pl-2">
                    Due Today ({dueTodayGroup.length})
                  </h2>
                  <div className="space-y-3">
                    {dueTodayGroup.map(c => (
                      <ChoreCard key={c.id} chore={c} members={members ?? []} isParent={isParent} error={actionErrors[c.id] || null} onComplete={() => handleComplete(c.id)} onDelete={() => handleDelete(c)} onUpdateDueDate={dueDate => handleUpdateDueDate(c.id, dueDate)} onApprove={() => handleApprove(c.id)} onReject={() => handleReject(c.id)} updating={updateChore.isPending || completeChore.isPending || approveChore.isPending || rejectChore.isPending} />
                    ))}
                  </div>
                </section>
              )}

              {upcomingGroup.length > 0 && (
                <section>
                  <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4 pl-2">
                    Upcoming ({upcomingGroup.length})
                  </h2>
                  <div className="space-y-3">
                    {upcomingGroup.map(c => (
                      <ChoreCard key={c.id} chore={c} members={members ?? []} isParent={isParent} error={actionErrors[c.id] || null} onComplete={() => handleComplete(c.id)} onDelete={() => handleDelete(c)} onUpdateDueDate={dueDate => handleUpdateDueDate(c.id, dueDate)} onApprove={() => handleApprove(c.id)} onReject={() => handleReject(c.id)} updating={updateChore.isPending || completeChore.isPending || approveChore.isPending || rejectChore.isPending} />
                    ))}
                  </div>
                </section>
              )}

              {doneGroup.length > 0 && (
                <section>
                  <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4 pl-2">
                    Completed ({doneGroup.length})
                  </h2>
                  <div className="space-y-3">
                    {doneGroup.map(c => (
                      <ChoreCard key={c.id} chore={c} members={members ?? []} isParent={isParent} error={actionErrors[c.id] || null} onComplete={() => handleComplete(c.id)} onDelete={() => handleDelete(c)} onUpdateDueDate={dueDate => handleUpdateDueDate(c.id, dueDate)} onApprove={() => handleApprove(c.id)} onReject={() => handleReject(c.id)} updating={updateChore.isPending || completeChore.isPending || approveChore.isPending || rejectChore.isPending} />
                    ))}
                  </div>
                </section>
              )}

            </div>
          )}
        </div>

      {/* Modals */}
      {adding && (
        <AddChoreForm
          properties={properties ?? []}
          members={(members ?? []).filter(m => m.role !== "pet")}
          onSubmit={handleCreate}
          onCancel={() => {
            setAdding(false);
            setActionErrors(prev => { const next = { ...prev }; delete next["create"]; return next; });
          }}
          saving={createChore.isPending}
          createError={actionErrors["create"]}
        />
      )}

      {transactWallet && (
        <WalletTransactionModal
          wallet={transactWallet}
          onClose={() => {
            setTransactWallet(null);
            setActionErrors(prev => { const next = { ...prev }; delete next["wallet"]; return next; });
          }}
          onSave={handleWalletTx}
          saving={createWalletTx.isPending}
          saveError={actionErrors["wallet"]}
        />
      )}

      <ConfirmActionDialog
        open={!!deletingChore}
        onOpenChange={(isOpen) => {
          if (!isOpen && !deleteChore.isPending) setDeletingChore(null);
        }}
        title="Delete Chore"
        description={`Are you sure you want to delete "${deletingChore?.title}"?`}
        confirmLabel="Delete"
        destructive={true}
        pending={deleteChore.isPending}
        error={deleteChore.isError ? "Failed to delete chore. Please try again." : null}
        onConfirm={() => {
          if (deletingChore) {
            deleteChore.mutate(
              { id: deletingChore.id },
              {
                onSuccess: () => {
                  invalidateChores();
                  setDeletingChore(null);
                },
              }
            );
          }
        }}
      />
    </div>
  );
}
