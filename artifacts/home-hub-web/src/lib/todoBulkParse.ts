import { ONE_TIME, parseBulkDate, parseFrequencyDays, splitBulkLines } from "./maintenanceBulkParse";

export interface ParsedBulkTodo {
  line: number;
  content: string;
  dueDate: string | null;
  error: string | null;
}

/** Matches the API's limits for POST /todo-lists/:id/items/bulk. */
export const MAX_BULK_TODO_ITEMS = 50;
const MAX_TODO_CONTENT_LENGTH = 500;

/**
 * One to-do per line: `Task name | due date`, using the same line format as
 * maintenance bulk entry. A repeat like "yearly" is flagged rather than
 * silently dropped, since to-dos don't recur.
 */
export function parseBulkTodos(input: string): ParsedBulkTodo[] {
  return splitBulkLines(input).map(({ line, title, parts }) => {
    const todo: ParsedBulkTodo = { line, content: title, dueDate: null, error: null };
    let repeat: string | null = null;
    const unrecognized: string[] = [];
    for (const part of parts) {
      const date = parseBulkDate(part);
      if (date) todo.dueDate = date;
      else if (ONE_TIME.test(part)) continue;
      else if (parseFrequencyDays(part) !== null) repeat = part;
      else unrecognized.push(part);
    }

    if (!title) todo.error = "Missing a task name";
    else if (title.length > MAX_TODO_CONTENT_LENGTH) todo.error = "Task name is too long";
    else if (repeat) todo.error = `To-dos don't repeat ("${repeat}"). Add recurring upkeep under Maintenance.`;
    else if (unrecognized.length > 0) todo.error = `Couldn't read "${unrecognized[0]}" as a date`;
    return todo;
  });
}
