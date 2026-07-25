import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "error";
  text: string;
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  pendingId: string | null;
  addMessage: (message: ChatMessage) => void;
  upsertAgentChunk: (replyId: string, delta: string, timestamp: number) => void;
  finalizeMessage: (replyId: string, text: string, timestamp: number) => void;
  addErrorMessage: (id: string, text: string) => void;
  setPendingId: (id: string | null) => void;
  clearMessages: () => void;
}

const CHAT_STORAGE_KEY = "NeuralCleave_chat";
const MAX_PERSISTED_MESSAGES = 100;

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      pendingId: null,

      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),

      upsertAgentChunk: (replyId, delta, timestamp) =>
        set((state) => {
          const idx = state.messages.findIndex((m) => m.id === replyId);
          if (idx === -1) {
            return {
              messages: [
                ...state.messages,
                { id: replyId, role: "agent" as const, text: delta, timestamp },
              ],
            };
          }
          const updated = [...state.messages];
          updated[idx] = { ...updated[idx], text: updated[idx].text + delta };
          return { messages: updated };
        }),

      finalizeMessage: (replyId, text, timestamp) =>
        set((state) => {
          const idx = state.messages.findIndex((m) => m.id === replyId);
          if (idx === -1) {
            return {
              messages: [
                ...state.messages,
                { id: replyId, role: "agent" as const, text, timestamp },
              ],
            };
          }
          const updated = [...state.messages];
          updated[idx] = { ...updated[idx], text };
          return { messages: updated };
        }),

      addErrorMessage: (id, text) =>
        set((state) => ({
          messages: [
            ...state.messages,
            { id, role: "error" as const, text, timestamp: Date.now() / 1000 },
          ],
        })),

      setPendingId: (id) => set({ pendingId: id }),

      clearMessages: () => set({ messages: [], pendingId: null }),
    }),
    {
      name: CHAT_STORAGE_KEY,
      // Persist only messages (not pendingId — in-flight state shouldn't
      // survive a restart and would leave the UI stuck in a loading state).
      partialize: (state) => ({
        messages: state.messages.slice(-MAX_PERSISTED_MESSAGES),
      }),
    }
  )
);
