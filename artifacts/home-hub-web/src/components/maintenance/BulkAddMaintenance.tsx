import React, { useMemo, useState } from "react";
import { addDays } from "date-fns";
import { Loader2, X } from "lucide-react";
import {
  useCreateMaintenanceTask,
  type CreateMaintenanceTaskInputCategory,
} from "@workspace/api-client-react";
import { getLocalDateOnly } from "@/lib/dateOnly";
import {
  MAX_BULK_MAINTENANCE_TASKS,
  describeFrequency,
  parseBulkMaintenance,
  spreadOffsetDays,
} from "@/lib/maintenanceBulkParse";

interface BulkAddMaintenanceProps {
  property: { id: string; name: string };
  timezone: string;
  onClose: () => void;
  onCreated: () => Promise<unknown>;
}

const PLACEHOLDER = `Replace furnace filter | every 3 months
Clean gutters | twice a year | 2026-10-15
Pump septic tank | every 3 years
Winterize dock | once | 10/20/2026
Test smoke detectors | monthly`;

export function BulkAddMaintenance({ property, timezone, onClose, onCreated }: BulkAddMaintenanceProps) {
  const createTask = useCreateMaintenanceTask();
  const [text, setText] = useState("");
  const [dueMode, setDueMode] = useState<"spread" | "today">("spread");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  const parsed = useMemo(() => parseBulkMaintenance(text), [text]);
  const valid = parsed.filter(task => !task.error);
  const tooMany = parsed.length > MAX_BULK_MAINTENANCE_TASKS;

  const dueDates = useMemo(() => {
    const today = new Date();
    let undatedIndex = 0;
    return parsed.map(task => {
      if (task.dueDate) return task.dueDate;
      const offset = dueMode === "spread" ? spreadOffsetDays(undatedIndex) : 0;
      undatedIndex += 1;
      return getLocalDateOnly(addDays(today, offset));
    });
  }, [parsed, dueMode]);

  const addAll = async () => {
    if (submitting || valid.length === 0 || tooMany) return;
    setSubmitting(true);
    setResult(null);
    setProgress(0);
    let added = 0;
    const failures: string[] = [];
    const duplicates: string[] = [];
    const finishedLines = new Set<number>();
    try {
      for (const [index, task] of parsed.entries()) {
        if (task.error) continue;
        try {
          await createTask.mutateAsync({
            data: {
              title: task.title,
              description: null,
              propertyId: property.id,
              category: task.category as CreateMaintenanceTaskInputCategory,
              scheduleType: task.scheduleType,
              ...(task.scheduleType === "recurring"
                ? { frequencyDays: task.frequencyDays as number, startDate: dueDates[index] }
                : { nextDueDate: dueDates[index] }),
              timezone,
            },
          });
          added += 1;
          finishedLines.add(task.line);
        } catch (error) {
          if ((error as { status?: number }).status === 409) {
            duplicates.push(task.title);
            finishedLines.add(task.line);
          } else {
            failures.push(task.title);
          }
        }
        setProgress(current => current + 1);
      }
      if (added > 0) await onCreated();
      // Leave only the lines that still need attention so a retry can't double-add.
      setText(current => current.split(/\r?\n/).filter((_, i) => !finishedLines.has(i + 1)).join("\n"));
      const parts = [`${added} task${added === 1 ? "" : "s"} added to ${property.name}.`];
      if (duplicates.length > 0) parts.push(`${duplicates.length} already existed and ${duplicates.length === 1 ? "was" : "were"} skipped (${duplicates.slice(0, 3).join(", ")}${duplicates.length > 3 ? ", …" : ""}).`);
      if (failures.length > 0) parts.push(`${failures.length} could not be added and ${failures.length === 1 ? "is" : "are"} still in the box: ${failures.slice(0, 3).join(", ")}${failures.length > 3 ? ", …" : ""}.`);
      setResult(parts.join(" "));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="bulk-maintenance-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 id="bulk-maintenance-title" className="font-serif text-2xl font-bold">Add many tasks at once</h2>
            <p className="mt-1 text-sm text-muted-foreground">Paste or type one task per line for {property.name}. Add how often and the first due date after a “|” if you know them.</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close bulk add" className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <textarea
            value={text}
            onChange={event => { setText(event.target.value); setResult(null); }}
            disabled={submitting}
            rows={7}
            spellCheck={false}
            aria-label="Maintenance tasks, one per line"
            placeholder={PLACEHOLDER}
            className="w-full resize-y rounded-xl border-2 border-border bg-background px-3 py-2.5 font-mono text-sm focus:border-primary focus:outline-none disabled:opacity-60"
          />
          <p className="text-xs text-muted-foreground">
            How often: weekly, monthly, quarterly, yearly, twice a year, or “every 3 months / 2 weeks / 5 years”. Leave it out for yearly. Write “once” with a date for a one-time task.
          </p>

          <label className="flex flex-wrap items-center gap-2 text-sm font-bold">
            Tasks with no date are first due
            <select value={dueMode} onChange={event => setDueMode(event.target.value as "spread" | "today")} disabled={submitting} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-bold">
              <option value="spread">spread over the next 8 weeks</option>
              <option value="today">all today</option>
            </select>
          </label>

          {tooMany && <p role="alert" className="text-sm font-medium text-destructive">That’s {parsed.length} lines. Add up to {MAX_BULK_MAINTENANCE_TASKS} at a time.</p>}

          {parsed.length > 0 && (
            <ul className="space-y-1.5" aria-label="Preview">
              {parsed.map((task, index) => (
                <li key={`${task.line}-${task.title}`} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-sm ${task.error ? "border-destructive/40 bg-destructive/5" : "border-border bg-background"}`}>
                  <span className="min-w-0 flex-1 truncate font-bold">{task.title || "(no name)"}</span>
                  {task.error ? (
                    <span className="text-xs font-medium text-destructive">Line {task.line}: {task.error}</span>
                  ) : (
                    <>
                      <span className={`text-xs font-medium ${task.frequencyAssumed ? "text-amber-700" : "text-muted-foreground"}`}>
                        {task.scheduleType === "one-time" ? "One time" : `${describeFrequency(task.frequencyDays as number)}${task.frequencyAssumed ? " (assumed)" : ""}`}
                      </span>
                      <span className="text-xs text-muted-foreground">first due {dueDates[index]}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{task.category}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {result && <p role="status" className="rounded-xl bg-muted p-3 text-sm font-medium">{result}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border p-5">
          <span className="text-sm text-muted-foreground">
            {submitting ? `Adding ${progress} of ${valid.length}…` : `${valid.length} ready${parsed.length > valid.length ? `, ${parsed.length - valid.length} need fixing` : ""}`}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50">Close</button>
            <button type="button" onClick={addAll} disabled={submitting || valid.length === 0 || tooMany} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}{submitting ? "Adding…" : `Add ${valid.length || ""} task${valid.length === 1 ? "" : "s"}`.replace("Add  ", "Add ")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
