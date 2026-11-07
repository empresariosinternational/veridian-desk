/** Personal tasks live in this browser; the assistant receives a bounded snapshot. */
export type Priority = "high" | "normal" | "low";
export type Task = { id: string; title: string; priority: Priority; dueDate: string | null; completed: boolean };
export type TaskAction = { type: "add" | "update" | "complete" | "reopen"; id: string | null; title: string | null; priority: Priority | null; dueDate: string | null };
export type Suggestion = { title: string; priority: Priority; dueDate: string | null };
export type Message = { role: "user" | "assistant"; text: string; suggestions?: Suggestion[]; error?: boolean };

const STORAGE_KEY = "agentscene.veridian.tasks.v1";
const PRIORITIES: Priority[] = ["high", "normal", "low"];
export const MAX_TASKS = 100;

export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const t = value as Task;
  return typeof t.id === "string" && t.id.length > 0 && t.id.length <= 100 && typeof t.title === "string" && t.title.trim().length > 0 && t.title.length <= 240
    && PRIORITIES.includes(t.priority) && typeof t.completed === "boolean" && (t.dueDate === null || validDate(t.dueDate));
}

export function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (stored?.version !== 1 || !Array.isArray(stored.tasks)) return [];
    const ids = new Set<string>();
    return stored.tasks.filter(isTask).filter((task: Task) => {
      if (ids.has(task.id)) return false;
      ids.add(task.id); return true;
    }).slice(0, MAX_TASKS);
  } catch { return []; }
}

export function saveTasks(tasks: Task[]): boolean {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks })); return true; }
  catch { return false; }
}

export function taskStorageKey(): string { return STORAGE_KEY; }

const normalized = (title: string) => title.trim().replace(/\s+/g, " ").toLocaleLowerCase();

/** Validate every action before returning a new list; never partially mutate a batch. */
export function applyTaskActions(tasks: Task[], actions: TaskAction[], id = () => crypto.randomUUID()): Task[] {
  const next = tasks.map((task) => ({ ...task }));
  for (const action of actions) {
    if (action.type === "add" || action.type === "update") {
      if (!action.title?.trim() || action.title.length > 240 || !PRIORITIES.includes(action.priority) || (action.dueDate !== null && !validDate(action.dueDate))) {
        throw new Error("That task needs a title, a valid priority, and a valid date.");
      }
    }
    if (action.type === "add") {
      if (action.id !== null) throw new Error("A new task cannot replace an existing task.");
      if (next.some((task) => !task.completed && normalized(task.title) === normalized(action.title) && task.dueDate === action.dueDate)) continue;
      if (next.length >= MAX_TASKS) throw new Error("Your task list is full. Remove a completed task to make space.");
      next.push({ id: id(), title: action.title.trim(), priority: action.priority, dueDate: action.dueDate, completed: false });
    } else {
      const task = next.find((task) => task.id === action.id);
      if (!task) throw new Error("That task changed or is no longer available. Please try again.");
      if (action.type === "complete") task.completed = true;
      else if (action.type === "reopen") task.completed = false;
      else if (action.type === "update") Object.assign(task, { title: action.title.trim(), priority: action.priority, dueDate: action.dueDate });
      else throw new Error("That task action is unavailable.");
    }
  }
  return next;
}

export function sortTasks(tasks: Task[], today = localDay()): Task[] {
  const rank: Record<Priority, number> = { high: 0, normal: 1, low: 2 };
  return [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed)
    || Number(Boolean(b.dueDate && b.dueDate < today)) - Number(Boolean(a.dueDate && a.dueDate < today))
    || rank[a.priority] - rank[b.priority] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}
