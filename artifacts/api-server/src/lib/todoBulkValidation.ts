export const MAX_BULK_TODO_ITEMS = 50;
export const MAX_BULK_TODO_CONTENT_LENGTH = 500;

export type BulkTodoEntry = {
  content: string;
  dueDate?: string;
  assigneeId?: string | null;
};

export type BulkTodoInput = {
  defaultDueDate: string;
  items: BulkTodoEntry[];
};

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/**
 * Validates and normalizes raw bulk-item input before any database writes.
 * Keeping this independent of the route makes invalid input rejectable before
 * the transaction begins.
 */
export function parseBulkTodoInput(value: unknown):
  | { success: true; data: BulkTodoInput }
  | { success: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { success: false, error: "Request body must be an object" };
  }

  const body = value as Record<string, unknown>;
  if (!isValidDate(body.defaultDueDate)) {
    return { success: false, error: "defaultDueDate must be a valid YYYY-MM-DD date" };
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_BULK_TODO_ITEMS) {
    return { success: false, error: `items must contain between 1 and ${MAX_BULK_TODO_ITEMS} tasks` };
  }

  const items: BulkTodoEntry[] = [];
  for (let index = 0; index < body.items.length; index += 1) {
    const rawItem = body.items[index];
    if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) {
      return { success: false, error: `Item ${index + 1} must be an object` };
    }
    const item = rawItem as Record<string, unknown>;
    if (typeof item.content !== "string") {
      return { success: false, error: `Item ${index + 1} content must be text` };
    }
    const content = item.content.trim();
    if (content.length === 0 || content.length > MAX_BULK_TODO_CONTENT_LENGTH) {
      return { success: false, error: `Item ${index + 1} content must be 1 to ${MAX_BULK_TODO_CONTENT_LENGTH} characters` };
    }
    if (item.dueDate !== undefined && !isValidDate(item.dueDate)) {
      return { success: false, error: `Item ${index + 1} dueDate must be a valid YYYY-MM-DD date` };
    }
    if (item.assigneeId !== undefined && item.assigneeId !== null && typeof item.assigneeId !== "string") {
      return { success: false, error: `Item ${index + 1} assigneeId must be a valid id` };
    }
    items.push({
      content,
      ...(item.dueDate !== undefined && { dueDate: item.dueDate }),
      ...(item.assigneeId !== undefined && { assigneeId: item.assigneeId as string | null }),
    });
  }

  return { success: true, data: { defaultDueDate: body.defaultDueDate, items } };
}