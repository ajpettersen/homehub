import assert from "node:assert/strict";
import { parseBulkTodoInput, MAX_BULK_TODO_ITEMS } from "../src/lib/todoBulkValidation";

const valid = parseBulkTodoInput({
  defaultDueDate: "2026-02-28",
  items: [{ content: "  Book plumber  " }, { content: "Pack bags", dueDate: "2026-03-01" }],
});
assert.equal(valid.success, true, "valid bulk task input is accepted");
if (valid.success) {
  assert.equal(valid.data.items[0].content, "Book plumber", "content is normalized");
  assert.equal(valid.data.items[0].dueDate, undefined, "line may use the shared default date");
}

assert.equal(
  parseBulkTodoInput({ defaultDueDate: "2026-02-30", items: [{ content: "Impossible date" }] }).success,
  false,
  "calendar-invalid default dates are rejected",
);
assert.equal(
  parseBulkTodoInput({ defaultDueDate: "2026-02-28", items: [{ content: "Task", dueDate: "not-a-date" }] }).success,
  false,
  "invalid per-task dates are rejected",
);
assert.equal(
  parseBulkTodoInput({ defaultDueDate: "2026-02-28", items: [{ content: "   " }] }).success,
  false,
  "blank tasks are rejected",
);
assert.equal(
  parseBulkTodoInput({
    defaultDueDate: "2026-02-28",
    items: Array.from({ length: MAX_BULK_TODO_ITEMS + 1 }, () => ({ content: "Task" })),
  }).success,
  false,
  "oversized batches are rejected",
);

console.log("Todo bulk validation tests passed");