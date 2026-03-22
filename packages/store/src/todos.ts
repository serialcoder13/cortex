import { create } from "zustand";

export type TodoPriority = "urgent" | "high" | "medium" | "low";

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  documentId?: string;
  priority?: TodoPriority;
  dueDate?: string | null;
  sourceDocument?: string;
}

export interface TodoState {
  /** All todos */
  todos: Todo[];

  /** Add a new todo */
  add: (text: string, documentId?: string) => void;
  /** Remove a todo by id */
  remove: (id: string) => void;
  /** Toggle a todo's completed status */
  toggle: (id: string) => void;
  /** Update a todo's text */
  updateText: (id: string, text: string) => void;
  /** Set the full list of todos (e.g., after loading from storage) */
  setTodos: (todos: Todo[]) => void;
  /** Get todos filtered by document id */
  getTodosByDocument: (documentId: string) => Todo[];
}

export const useTodoStore = create<TodoState>((set, get) => ({
  todos: [],

  add: (text, documentId) =>
    set((state) => ({
      todos: [
        ...state.todos,
        {
          id: crypto.randomUUID(),
          text,
          completed: false,
          createdAt: new Date().toISOString(),
          documentId,
        },
      ],
    })),

  remove: (id) =>
    set((state) => ({
      todos: state.todos.filter((todo) => todo.id !== id),
    })),

  toggle: (id) =>
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    })),

  updateText: (id, text) =>
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, text } : todo,
      ),
    })),

  setTodos: (todos) => set({ todos }),

  getTodosByDocument: (documentId) =>
    get().todos.filter((todo) => todo.documentId === documentId),
}));
