"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Wand2, X } from "lucide-react";

// ─── Sorting Hat SVG icon ─────────────────────────────────────────────────────
function HatIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Hat body - pointed wizard hat silhouette */}
      <path
        d="M32 4L18 44H8L14 52H50L56 44H46L32 4Z"
        fill="currentColor"
      />
      {/* Brim */}
      <path
        d="M6 52C6 52 12 58 32 58C52 58 58 52 58 52L56 48H8L6 52Z"
        fill="currentColor"
        opacity="0.8"
      />
      {/* Band/buckle */}
      <rect x="26" y="46" width="12" height="6" rx="1" fill="currentColor" opacity="0.4" />
      {/* Star sparkle */}
      <path
        d="M44 14L45.5 17.5L49 19L45.5 20.5L44 24L42.5 20.5L39 19L42.5 17.5L44 14Z"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system-note" | "revelio";
  content: string;
};

type Props = {
  isOpen: boolean;
  onToggle: () => void;
  onSendCommand: (
    command: string,
    history: Array<{ role: "user" | "assistant"; content: string }>
  ) => Promise<{ reply: string; createdIds: string[]; results: Array<{ tool: string; id?: string; [k: string]: unknown }> }>;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SortingHatPanel({ isOpen, onToggle, onSendCommand }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hmm, what have we here? Place me upon your thoughts and I shall sort them onto this canvas. What would you like me to conjure?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgIdRef = useRef(0);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const nextId = useCallback(() => {
    msgIdRef.current += 1;
    return `msg-${msgIdRef.current}`;
  }, []);

  // Build conversation history for the API (exclude system-notes, revelio, and welcome)
  const getHistory = useCallback(
    (msgs: ChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> => {
      return msgs
        .filter((m) => m.role !== "system-note" && m.role !== "revelio" && m.id !== "welcome")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    },
    []
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking) return;

    const userMsg: ChatMessage = { id: nextId(), role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsThinking(true);

    try {
      const history = getHistory(updatedMessages);
      const { reply, createdIds, results } = await onSendCommand(text, history);

      const newMessages: ChatMessage[] = [];

      // Add a Revelio reveal or system note summarizing tool actions
      const createdCount = createdIds.length;
      const toolActions = results.filter((r) => r.tool && r.tool !== "getBoardState");
      if (toolActions.length > 0) {
        const actionSummary = summarizeActions(toolActions, createdCount);
        if (actionSummary) {
          newMessages.push({ id: nextId(), role: "revelio", content: actionSummary });
        }
      }

      // Add the AI reply
      if (reply) {
        newMessages.push({ id: nextId(), role: "assistant", content: reply });
      } else {
        // Fallback if no text reply (shouldn't happen with updated prompt)
        newMessages.push({
          id: nextId(),
          role: "assistant",
          content: createdCount > 0
            ? "It is done."
            : "I have heeded your request.",
        });
      }

      setMessages((prev) => [...prev, ...newMessages]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "The magic faltered...";
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: `Alas... ${errMsg}` },
      ]);
    } finally {
      setIsThinking(false);
    }
  }, [input, isThinking, messages, nextId, getHistory, onSendCommand]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ─── FAB (Floating Action Button) ──────────────────────────────────────────
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="hat-fab fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-amber-700 via-amber-600 to-purple-800 text-amber-200 flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
        aria-label="Open Sorting Hat"
      >
        <HatIcon size={30} />
      </button>
    );
  }

  // ─── Chat Panel ────────────────────────────────────────────────────────────
  return (
    <div className="chat-panel-enter fixed top-0 right-0 bottom-0 w-[340px] z-50 flex flex-col shadow-2xl"
      style={{ background: "linear-gradient(180deg, #1a1033 0%, #0f0d1a 100%)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-purple-900/50">
        <HatIcon size={24} className="text-amber-400 shrink-0" />
        <h2 className="text-sm font-semibold text-amber-200 flex-1">The Sorting Hat</h2>
        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded-md text-purple-400 hover:text-purple-200 hover:bg-purple-900/40 transition-colors"
          aria-label="Close chat panel"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scroll-smooth">
        {messages.map((msg) => {
          if (msg.role === "system-note") {
            return (
              <div key={msg.id} className="text-center">
                <span className="inline-block text-[11px] text-amber-400/70 bg-amber-900/20 rounded-full px-3 py-1">
                  {msg.content}
                </span>
              </div>
            );
          }
          if (msg.role === "revelio") {
            return (
              <div key={msg.id} className="revelio-container text-center py-2">
                {/* Sparkle cloud */}
                <div className="revelio-burst relative inline-block">
                  <span className="revelio-sparkle revelio-sparkle-1" />
                  <span className="revelio-sparkle revelio-sparkle-2" />
                  <span className="revelio-sparkle revelio-sparkle-3" />
                  <span className="revelio-sparkle revelio-sparkle-4" />
                  <span className="revelio-sparkle revelio-sparkle-5" />
                  <span className="revelio-sparkle revelio-sparkle-6" />
                  <span className="revelio-text font-bold text-sm tracking-wider">
                    Revelio!
                  </span>
                </div>
                {/* Summary line below */}
                <div className="revelio-summary mt-1.5">
                  <span className="inline-block text-[11px] text-amber-400/70 bg-amber-900/20 rounded-full px-3 py-1">
                    {msg.content}
                  </span>
                </div>
              </div>
            );
          }
          if (msg.role === "user") {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm bg-purple-700/50 text-purple-100 whitespace-pre-wrap break-words">
                  {msg.content}
                </div>
              </div>
            );
          }
          // assistant
          return (
            <div key={msg.id} className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm bg-amber-900/30 text-amber-100/90 whitespace-pre-wrap break-words" style={{ fontStyle: "italic" }}>
                {msg.content}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isThinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 bg-amber-900/30 flex items-center gap-1">
              <span className="text-xs text-amber-300/70 italic mr-1.5">The hat is thinking</span>
              <span className="hat-dot-1 w-1.5 h-1.5 rounded-full bg-amber-400/70" />
              <span className="hat-dot-2 w-1.5 h-1.5 rounded-full bg-amber-400/70" />
              <span className="hat-dot-3 w-1.5 h-1.5 rounded-full bg-amber-400/70" />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-3 pb-3 pt-1">
        <div className="flex items-end gap-2 bg-purple-950/60 border border-purple-800/50 rounded-xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Speak to the hat..."
            rows={1}
            className="flex-1 bg-transparent outline-none text-sm text-purple-100 placeholder:text-purple-500 resize-none max-h-24"
            disabled={isThinking}
            style={{ lineHeight: "1.4" }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="shrink-0 p-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            aria-label="Send message"
          >
            <Wand2 size={16} />
          </button>
        </div>
        <p className="text-[10px] text-purple-600 mt-1.5 text-center">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function summarizeActions(
  actions: Array<{ tool: string; id?: string; [k: string]: unknown }>,
  createdCount: number
): string {
  const toolCounts: Record<string, number> = {};
  for (const a of actions) {
    const name = friendlyToolName(a.tool);
    toolCounts[name] = (toolCounts[name] ?? 0) + 1;
  }
  const parts = Object.entries(toolCounts).map(
    ([name, count]) => (count > 1 ? `${count} ${name}s` : `${count} ${name}`)
  );
  if (parts.length === 0) return "";
  return `✨ ${parts.join(", ")} conjured`;
}

function friendlyToolName(tool: string): string {
  const map: Record<string, string> = {
    createStickyNote: "sticky note",
    createShape: "shape",
    createFrame: "frame",
    createConnector: "connector",
    moveObject: "move",
    changeColor: "color change",
    resizeObject: "resize",
    updateText: "text update",
    arrangeInGrid: "grid arrangement",
    createSWOTTemplate: "SWOT template",
    createJourneyMap: "journey map",
    createRetroTemplate: "retro template",
  };
  return map[tool] ?? tool;
}
