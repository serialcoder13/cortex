import { useMemo } from "react";
import { useTodoStore } from "@cortex/store";
import type { Todo, TodoPriority } from "@cortex/store";

const PRIORITY_ORDER: TodoPriority[] = ["urgent", "high", "medium", "low"];

const PRIORITY_COLORS: Record<TodoPriority, string> = {
  urgent: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  low: "bg-neutral-500/20 text-neutral-400 border-neutral-500/30",
};

const PRIORITY_LABELS: Record<TodoPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function isPastDue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PriorityBadge({ priority }: Readonly<{ priority: TodoPriority }>) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function TodoItem({
  todo,
  onToggle,
}: Readonly<{
  todo: Readonly<Todo>;
  onToggle: (id: string) => void;
}>) {
  const pastDue = isPastDue(todo.dueDate);
  const priority = todo.priority ?? "medium";

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 transition-colors hover:border-neutral-700 ${
        todo.completed ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(todo.id)}
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
          todo.completed
            ? "border-blue-500 bg-blue-500 text-white"
            : "border-neutral-600 hover:border-neutral-400"
        }`}
        aria-label={todo.completed ? "Mark incomplete" : "Mark complete"}
      >
        {todo.completed && (
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm ${
            todo.completed
              ? "text-neutral-500 line-through"
              : "text-neutral-100"
          }`}
        >
          {todo.text}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <PriorityBadge priority={priority} />

          {todo.dueDate && (
            <span
              className={`text-xs ${
                pastDue && !todo.completed
                  ? "font-medium text-red-400"
                  : "text-neutral-500"
              }`}
            >
              {pastDue && !todo.completed ? "Overdue: " : "Due: "}
              {formatDate(todo.dueDate)}
            </span>
          )}

          {todo.sourceDocument && (
            <span className="text-xs text-neutral-600" title={todo.sourceDocument}>
              from {todo.sourceDocument.split("/").pop()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TodosPage() {
  const todos = useTodoStore((s) => s.todos);
  const toggle = useTodoStore((s) => s.toggle);

  const { activeTodos, completedTodos } = useMemo(() => {
    const active: Todo[] = [];
    const completed: Todo[] = [];

    for (const todo of todos) {
      if (todo.completed) {
        completed.push(todo);
      } else {
        active.push(todo);
      }
    }

    return { activeTodos: active, completedTodos: completed };
  }, [todos]);

  const grouped = useMemo(() => {
    const groups: Record<TodoPriority, Todo[]> = {
      urgent: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const todo of activeTodos) {
      const priority = todo.priority ?? "medium";
      groups[priority].push(todo);
    }

    return groups;
  }, [activeTodos]);

  const hasAnyTodos = todos.length > 0;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="mb-6 text-2xl font-semibold text-neutral-100">Todos</h2>

      {!hasAnyTodos && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center">
          <p className="text-neutral-400">No todos yet.</p>
          <p className="mt-1 text-sm text-neutral-600">
            Action items extracted from your documents will appear here.
          </p>
        </div>
      )}

      {hasAnyTodos && (
        <div className="space-y-8">
          {PRIORITY_ORDER.map((priority) => {
            const items = grouped[priority];
            if (items.length === 0) return null;

            return (
              <section key={priority}>
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-500">
                  {PRIORITY_LABELS[priority]} ({items.length})
                </h3>
                <div className="space-y-2">
                  {items.map((todo) => (
                    <TodoItem key={todo.id} todo={todo} onToggle={toggle} />
                  ))}
                </div>
              </section>
            );
          })}

          {completedTodos.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-500">
                Completed ({completedTodos.length})
              </h3>
              <div className="space-y-2">
                {completedTodos.map((todo) => (
                  <TodoItem key={todo.id} todo={todo} onToggle={toggle} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
