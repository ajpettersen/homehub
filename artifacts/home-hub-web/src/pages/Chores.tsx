import React, { useState, useMemo, useEffect, useRef } from "react";
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

// The API's isOverdue compares against the server's UTC day, which is already
// tomorrow during US evenings; compare against the viewer's local day instead.
function isChoreOverdue(chore: { completedAt?: string | null; dueDate?: string | null }): boolean {
  return !chore.completedAt && !!chore.dueDate && chore.dueDate < getLocalDateOnly();
}

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
  const overdue = chore.status === "open" && isChoreOverdue(chore);
  const dueToday = chore.status === "open" && chore.dueDate && isToday(parseISO(chore.dueDate));
  const hasReward = chore.rewardCents > 0;

  const assignee = members.find(m => m.id === chore.assigneeId);

  // A brief bounce the moment a chore flips to done — small reward for
  // finishing it, gone before it can feel like it's in the way.
  const [justCompleted, setJustCompleted] = useState(false);
  const wasDoneRef = useRef(isDone);
  useEffect(() => {
    if (isDone && !wasDoneRef.current) {
      setJustCompleted(true);
      const timer = setTimeout(() => setJustCompleted(false), 600);
      wasDoneRef.current = isDone;
      return () => clearTimeout(timer);
    }
    wasDoneRef.current = isDone;
    return undefined;
  }, [isDone]);

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
      <div className="flex items-start gap-4 p-4 sm:p-5">

        {/* Action Button / Status Icon */}
        <div className="pt-0.5 shrink-0">
          {!isDone && !isPending && (
            <button
              onClick={onComplete}
              disabled={updating}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center transition-all focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:opacity-50 ${
                overdue
                  ? "border-destructive/50 hover:bg-destructive/10 text-transparent hover:text-destructive"
                  : "border-muted-foreground/30 hover:border-primary hover:bg-primary/10 text-transparent hover:text-primary"
              }`}
              aria-label="Complete chore"
            >
              <Check className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
          {isDone && (
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-green-500 flex items-center justify-center shadow-sm ${justCompleted ? "animate-bounce" : ""}`}>
              <Check className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
          )}
          {isPending && (
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-primary border-dashed flex items-center justify-center animate-[spin_4s_linear_infinite]">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-primary" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className={`font-bold text-lg leading-snug break-words min-w-0 ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
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
                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 disabled:opacity-50 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
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
                  <span className={`break-words min-w-0 ${isDone ? "line-through text-muted-foreground" : "text-foreground font-medium"}`}>
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
                className="flex-1 sm:flex-none flex items-center justify-center min-h-[44px] gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors shadow-md hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Approve & Pay
              </button>
              <button
                onClick={onReject}
                disabled={updating}
                className="flex-1 sm:flex-none flex items-center justify-center min-h-[44px] gap-2 px-4 py-2.5 rounded-xl bg-muted text-foreground font-bold hover:bg-muted-foreground/10 transition-colors disabled:opacity-50"
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
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 px-4 py-3 sm:px-5 bg-muted/10">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mr-2 hidden sm:inline">Snooze</span>
          <button
            type="button"
            onClick={() => snoozeByDays(1)}
            disabled={updating}
            className="rounded-lg border-2 border-transparent min-h-[40px] bg-muted px-3 py-1.5 text-xs font-bold text-foreground hover:bg-background hover:border-border transition-all disabled:opacity-50"
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={() => snoozeByDays(7)}
            disabled={updating}
            className="rounded-lg border-2 border-transparent min-h-[40px] bg-muted px-3 py-1.5 text-xs font-bold text-foreground hover:bg-background hover:border-border transition-all disabled:opacity-50"
          >
            Next week
          </button>
          <div className="flex-1 min-w-[10px]" />
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`chore-due-date-${chore.id}`}>Due date</label>
            <input
              id={`chore-due-date-${chore.id}`}
              type="date"
              value={pickedDate}
              onChange={event => setPickedDate(event.target.value)}
              className="rounded-lg border-2 min-h-[40px] border-border bg-background px-2.5 py-1.5 text-xs font-medium focus:border-primary focus:outline-none w-[130px] sm:w-auto"
            />
            <button
              type="button"
              onClick={() => pickedDate && onUpdateDueDate(pickedDate)}
              disabled={!pickedDate || updating || pickedDate === chore.dueDate}
              className="rounded-lg bg-foreground min-h-[40px] px-3 py-1.5 text-xs font-bold text-background disabled:opacity-50 transition-colors hover:bg-foreground/90 shrink-0"
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
  const eligibleAssignees = isPaid ? members.filter(member => member.role === "child") : members.filter(member => member.role !== "pet");

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
        <div className="px-6 py-5 border-b border-border/50 flex items-center justify-between bg-muted/30 shrink-0">
          <h2 className="font-serif text-2xl font-bold text-foreground">New Chore</h2>
          <button onClick={onCancel} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handle} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">What needs to be done?</label>
            <input
              autoFocus
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 min-h-11 font-medium text-lg focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-muted-foreground/50"
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
                className="w-full bg-background border-2 border-border rounded-xl px-3 py-3 min-h-11 text-sm font-medium focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
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
                className="w-full bg-background border-2 border-border rounded-xl px-3 py-3 min-h-11 text-sm font-medium focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
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
                className="w-full bg-background border-2 border-border rounded-xl pl-8 pr-4 py-3 min-h-11 font-medium focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Checklist Bundles */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Checklist Items (Optional)</label>
            <div className="space-y-3">
              {bundleItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted/50 px-3 py-2 min-h-11 rounded-xl border border-border/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                  <span className="flex-1 text-sm font-medium text-foreground break-words min-w-0">{item}</span>
                  <button type="button" onClick={() => removeBundleItem(i)} className="p-2 min-h-11 min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors rounded-lg shrink-0">
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
                  className="flex-1 bg-background border-2 border-border rounded-xl px-3 py-2 min-h-11 text-sm font-medium focus:outline-none focus:border-primary transition-all min-w-0"
                />
                <button
                  type="button"
                  onClick={addBundleItem}
                  disabled={!newItem.trim()}
                  className="px-4 py-2 min-h-11 rounded-xl bg-muted text-foreground font-bold text-sm hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 shrink-0"
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
                  className={`px-4 py-2 min-h-[44px] rounded-xl text-sm font-bold transition-all border-2 ${
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

        <div className="p-4 sm:p-5 border-t border-border/50 bg-muted/30 flex gap-3 shrink-0">
          <button type="button" onClick={onCancel} className="flex-1 py-3.5 min-h-11 font-bold rounded-xl border-2 border-border text-foreground hover:bg-background transition-colors flex items-center justify-center gap-2">
            Cancel
          </button>
          <button type="submit" onClick={handle} disabled={saving} className="flex-[2] py-3.5 min-h-11 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50">
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
  onSave: (amountCents: number, description: string, type: "manual_credit" | "manual_debit") => void;
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
    onSave(isAdd ? cents : -cents, description.trim(), isAdd ? "manual_credit" : "manual_debit");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-sm rounded-[2rem] shadow-2xl border-2 border-border p-5 sm:p-6 animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <h2 className="font-serif text-xl font-bold text-foreground">Adjust Allowance</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex p-1 bg-muted rounded-xl gap-1 border border-border/50">
            <button
              type="button"
              onClick={() => setIsAdd(true)}
              className={`flex-1 min-h-[44px] py-2 text-sm font-bold rounded-lg transition-all ${isAdd ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Add Funds
            </button>
            <button
              type="button"
              onClick={() => setIsAdd(false)}
              className={`flex-1 min-h-[44px] py-2 text-sm font-bold rounded-lg transition-all ${!isAdd ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
                className="w-full bg-background border-2 border-border rounded-xl pl-8 pr-4 py-3 min-h-11 font-bold text-lg focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
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
              className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 min-h-11 font-medium focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
              placeholder={isAdd ? "e.g. Good grades" : "e.g. Bought a toy"}
            />
          </div>

          {saveError && <p role="alert" className="text-sm font-semibold text-destructive">{saveError}</p>}

          <button type="submit" disabled={saving} className="w-full py-3.5 min-h-11 font-bold rounded-xl bg-foreground text-background hover:bg-foreground/90 transition-all shadow-md mt-4 disabled:opacity-50">
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

  const { data: chores, isLoading, isError: isChoresError, refetch: refetchChores } = useGetChores({}, { query: { queryKey: getGetChoresQueryKey(), retry: false } });
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
        onError: () => setActionErrors(prev => ({ ...prev, [id]: "Failed to update date. Please try again." }))
      }
    );
  };

  const handleApprove = (id: string) => {
    clearError(id);
    approveChore.mutate(
      { id },
      {
        onSuccess: () => {
          invalidateChores();
          invalidateWallets();
        },
        onError: () => setActionErrors(prev => ({ ...prev, [id]: "Failed to approve chore. Please try again." }))
      }
    );
  };

  const handleReject = (id: string) => {
    clearError(id);
    rejectChore.mutate(
      { id },
      {
        onSuccess: invalidateChores,
        onError: () => setActionErrors(prev => ({ ...prev, [id]: "Failed to reject chore. Please try again." }))
      }
    );
  };

  // ── derived data ─────────────────────────────────────────────────────────────

  const filteredChores = useMemo(() => {
    if (!chores) return [];
    let list = chores;
    if (filter === "mine" && activeMember) list = list.filter(c => c.assigneeId === activeMember.id);
    if (filter === "today") list = list.filter(c => c.status === "open" && c.dueDate && isToday(parseISO(c.dueDate)));
    if (filter === "pending") list = list.filter(c => c.status === "pending");
    if (filter === "done") list = list.filter(c => c.status === "approved");

    if (filter !== "done") {
      list = list.filter(c => c.status !== "approved");
    }

    return list.sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;

      const aOverdue = isChoreOverdue(a);
      const bOverdue = isChoreOverdue(b);
      if (aOverdue && !bOverdue) return -1;
      if (bOverdue && !aOverdue) return 1;

      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && !b.dueDate) return -1;
      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }

      return a.title.localeCompare(b.title);
    });
  }, [chores, filter, activeMember]);

  const stats = useMemo(() => {
    if (!chores) return { total: 0, pending: 0, done: 0, mine: 0, today: 0 };
    return {
      total: chores.filter(c => c.status !== "approved").length,
      pending: chores.filter(c => c.status === "pending").length,
      done: chores.filter(c => c.status === "approved").length,
      mine: activeMember ? chores.filter(c => c.assigneeId === activeMember.id && c.status !== "approved").length : 0,
      today: chores.filter(c => c.status === "open" && c.dueDate && isToday(parseISO(c.dueDate))).length,
    };
  }, [chores, activeMember]);

  const FilterPill = ({ id, label, count, icon: Icon }: { id: typeof filter, label: string, count?: number, icon: any }) => (
    <button
      onClick={() => setFilter(id)}
      aria-pressed={filter === id}
      className={`flex items-center gap-1.5 px-4 py-2 min-h-11 rounded-xl text-sm font-bold transition-all border-2 shrink-0 ${
        filter === id
          ? "bg-foreground text-background border-foreground shadow-md"
          : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] ${filter === id ? "bg-background/20" : "bg-background shadow-sm"}`}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-bold text-foreground flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-accent-foreground" />
            Chores & Allowance
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">Earn rewards by helping around the house.</p>
        </div>
        <button
          onClick={() => {
            clearError("createChore");
            setAdding(true);
          }}
          className="flex items-center justify-center gap-2 px-5 py-3 min-h-11 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
        >
          <Plus className="w-5 h-5" /> New Chore
        </button>
      </div>

      {/* Wallets */}
      {members && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {walletsLoading ? (
            <div className="h-24 bg-muted/50 rounded-3xl animate-pulse" />
          ) : walletsError ? (
            <div className="rounded-3xl border-2 border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
              <AlertTriangle className="text-destructive w-5 h-5 shrink-0" />
              <p className="text-sm font-medium text-destructive flex-1">Failed to load allowances.</p>
              <button onClick={() => void refetchWallets()} className="text-xs min-h-11 px-3 font-bold border border-destructive/30 rounded-lg hover:bg-destructive/10">Retry</button>
            </div>
          ) : (() => {
            const visibleWallets = isParent ? wallets : wallets?.filter(w => w.memberId === activeMember?.id);
            if (!visibleWallets?.length) return null;
            return visibleWallets.map(wallet => {
              const member = members.find(m => m.id === wallet.memberId);
              if (!member) return null;
              return (
                <div key={wallet.memberId} className="flex items-center justify-between bg-card border-2 border-border p-4 rounded-3xl shadow-sm group">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm"
                      style={{ backgroundColor: member.color || "var(--color-primary)" }}
                    >
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">{isParent ? member.name : "My Wallet"}</h3>
                      <p className="text-sm font-semibold text-green-600 dark:text-green-500">{formatMoney(wallet.balanceCents)}</p>
                    </div>
                  </div>
                  {isParent && (
                    <button
                      onClick={() => {
                        clearError("walletModal");
                        setTransactWallet(wallet);
                      }}
                      className="w-10 h-10 min-h-[44px] min-w-[44px] rounded-xl bg-muted text-foreground flex items-center justify-center hover:bg-foreground hover:text-background transition-colors"
                      aria-label={`Adjust allowance for ${member.name}`}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 pb-2" aria-label="Chore filters">
        <FilterPill id="all" label="All Open" count={stats.total} icon={CheckCircle2} />
        {activeMember && <FilterPill id="mine" label="My Chores" count={stats.mine} icon={CheckCircle2} />}
        <FilterPill id="today" label="Due Today" count={stats.today} icon={CalendarClock} />
        <FilterPill id="pending" label={isParent ? "Needs Approval" : "Pending"} count={stats.pending} icon={Clock} />
        <FilterPill id="done" label="Completed" icon={Check} />
      </div>

      {/* Chores Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {isLoading ? (
          <>
            <div className="h-48 bg-muted/30 rounded-3xl animate-pulse" />
            <div className="h-48 bg-muted/30 rounded-3xl animate-pulse" />
          </>
        ) : isChoresError ? (
          <div className="col-span-full py-16 flex flex-col items-center justify-center bg-destructive/5 rounded-[2rem] border-2 border-dashed border-destructive/20 text-center px-4">
            <AlertCircle className="w-12 h-12 text-destructive mb-3" />
            <h3 className="font-serif text-2xl font-bold text-foreground mb-2">Chores failed to load</h3>
            <p className="text-muted-foreground mb-6">We couldn't fetch the latest chores.</p>
            <button onClick={() => void refetchChores()} className="px-6 py-3 min-h-11 rounded-xl bg-background border-2 border-border font-bold hover:bg-muted transition-colors">
              Try again
            </button>
          </div>
        ) : filteredChores.length === 0 ? (
          <div className="col-span-full py-16 flex flex-col items-center justify-center bg-card rounded-[2rem] border-2 border-dashed border-border text-center px-4">
            <CheckCircle className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <h3 className="font-serif text-2xl font-bold text-foreground mb-2">All caught up!</h3>
            <p className="text-muted-foreground">No chores match this filter right now.</p>
          </div>
        ) : (
          filteredChores.map(chore => (
            <ChoreCard
              key={chore.id}
              chore={chore}
              members={members ?? []}
              isParent={isParent}
              updating={
                (completeChore.isPending && completeChore.variables?.id === chore.id) ||
                (updateChore.isPending && updateChore.variables?.id === chore.id) ||
                (approveChore.isPending && approveChore.variables?.id === chore.id) ||
                (rejectChore.isPending && rejectChore.variables?.id === chore.id)
              }
              error={actionErrors[chore.id] ?? null}
              onComplete={() => handleComplete(chore.id)}
              onUpdateDueDate={(date) => handleUpdateDueDate(chore.id, date)}
              onApprove={() => handleApprove(chore.id)}
              onReject={() => handleReject(chore.id)}
              onDelete={() => handleDelete(chore)}
            />
          ))
        )}
      </div>

      {adding && (
        <AddChoreForm
          properties={properties ?? []}
          members={members ?? []}
          saving={createChore.isPending}
          createError={actionErrors["createChore"]}
          onSubmit={(data) => {
            clearError("createChore");
            createChore.mutate(
              { data },
              {
                onSuccess: () => {
                  setAdding(false);
                  invalidateChores();
                },
                onError: () => setActionErrors(prev => ({ ...prev, createChore: "Could not create chore. Please try again." }))
              }
            );
          }}
          onCancel={() => {
            setAdding(false);
            clearError("createChore");
          }}
        />
      )}

      {transactWallet && (
        <WalletTransactionModal
          wallet={transactWallet}
          onClose={() => {
            setTransactWallet(null);
            clearError("walletModal");
          }}
          onSave={(amountCents, description, type) => {
            clearError("walletModal");
            createWalletTx.mutate(
              { memberId: transactWallet.memberId, data: { amountCents, description, type } },
              {
                onSuccess: () => {
                  setTransactWallet(null);
                  invalidateWallets();
                },
                onError: () => setActionErrors(prev => ({ ...prev, walletModal: "Failed to update allowance. Please try again." }))
              }
            );
          }}
          saving={createWalletTx.isPending}
          saveError={actionErrors["walletModal"]}
        />
      )}

      <ConfirmActionDialog
        open={!!deletingChore}
        onOpenChange={(open) => !open && setDeletingChore(null)}
        title="Delete chore?"
        description={deletingChore ? `Are you sure you want to delete "${deletingChore.title}"?` : ""}
        confirmLabel="Delete chore"
        destructive
        pending={deleteChore.isPending}
        error={deletingChore && actionErrors[`delete-${deletingChore.id}`] ? actionErrors[`delete-${deletingChore.id}`] : null}
        onConfirm={() => {
          if (!deletingChore) return;
          clearError(`delete-${deletingChore.id}`);
          deleteChore.mutate(
            { id: deletingChore.id },
            {
              onSuccess: () => {
                setDeletingChore(null);
                invalidateChores();
              },
              onError: () => setActionErrors(prev => ({ ...prev, [`delete-${deletingChore.id}`]: "Could not delete chore. Please try again." }))
            }
          );
        }}
      />
    </div>
  );
}
