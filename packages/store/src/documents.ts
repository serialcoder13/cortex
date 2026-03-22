import { create } from "zustand";

export interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentState {
  /** All loaded documents */
  documents: Document[];
  /** Currently active document, if any */
  currentDoc: Document | null;
  /** Whether documents are being loaded */
  loading: boolean;

  /** Set the full list of documents */
  setDocuments: (documents: Document[]) => void;
  /** Set the currently active document */
  setCurrentDoc: (doc: Document | null) => void;
  /** Add a new document */
  addDocument: (doc: Document) => void;
  /** Update an existing document by id */
  updateDocument: (id: string, updates: Partial<Omit<Document, "id">>) => void;
  /** Remove a document by id */
  removeDocument: (id: string) => void;
  /** Set the loading state */
  setLoading: (loading: boolean) => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documents: [],
  currentDoc: null,
  loading: false,

  setDocuments: (documents) => set({ documents }),

  setCurrentDoc: (doc) => set({ currentDoc: doc }),

  addDocument: (doc) =>
    set((state) => ({
      documents: [...state.documents, doc],
    })),

  updateDocument: (id, updates) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id
          ? { ...doc, ...updates, updatedAt: new Date().toISOString() }
          : doc,
      ),
      currentDoc:
        state.currentDoc?.id === id
          ? {
              ...state.currentDoc,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : state.currentDoc,
    })),

  removeDocument: (id) =>
    set((state) => ({
      documents: state.documents.filter((doc) => doc.id !== id),
      currentDoc: state.currentDoc?.id === id ? null : state.currentDoc,
    })),

  setLoading: (loading) => set({ loading }),
}));
