"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type ConvMeta = { id: string; title: string; updatedAt: number };
type UiMsg = { role: "user" | "assistant"; content: string; learned?: string[] };
type Fact = { id: string; text: string };
type NoteMeta = { id: string; title: string; chars: number };

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export default function Home() {
  const [convs, setConvs] = useState<ConvMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [tab, setTab] = useState<"facts" | "notes">("facts");
  const [facts, setFacts] = useState<Fact[]>([]);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [newFact, setNewFact] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");

  const activeRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadConvs = useCallback(async () => {
    try {
      setConvs((await api<{ conversations: ConvMeta[] }>("/api/conversations")).conversations);
    } catch {}
  }, []);

  const loadMemory = useCallback(async (): Promise<Fact[] | null> => {
    try {
      const d = await api<{ facts: Fact[]; notes: NoteMeta[] }>("/api/memory");
      setFacts(d.facts);
      setNotes(d.notes);
      return d.facts;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    loadConvs();
    loadMemory();
  }, [loadConvs, loadMemory]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function guard(fn: () => Promise<unknown>) {
    try {
      setError(null);
      await fn();
    } catch (e) {
      setError(errText(e));
    }
  }

  function newChat() {
    activeRef.current = null;
    setActiveId(null);
    setMessages([]);
    setChatsOpen(false);
    setError(null);
  }

  function openConv(id: string) {
    return guard(async () => {
      const d = await api<{ conversation: { messages: UiMsg[] } }>(`/api/conversations/${id}`);
      activeRef.current = id;
      setActiveId(id);
      setMessages(d.conversation.messages);
      setChatsOpen(false);
    });
  }

  function removeConv(id: string) {
    if (!confirm("Delete this chat? This can't be undone.")) return;
    return guard(async () => {
      await api(`/api/conversations/${id}`, { method: "DELETE" });
      if (activeRef.current === id) newChat();
      loadConvs();
    });
  }

  // After a reply, the server extracts facts in the background. Check for new ones and show them.
  async function checkLearned(known: Set<string>, sentId: string, attempt = 0) {
    const all = await loadMemory();
    if (activeRef.current !== sentId) return;
    const fresh = (all ?? []).filter((f) => !known.has(f.id)).map((f) => f.text);
    if (fresh.length) {
      setMessages((m) => {
        const copy = m.slice();
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === "assistant") {
            copy[i] = { ...copy[i], learned: fresh };
            break;
          }
        }
        return copy;
      });
    } else if (attempt < 1) {
      setTimeout(() => checkLearned(known, sentId, attempt + 1), 5000);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setError(null);
    setBusy(true);
    const known = new Set(facts.map((f) => f.id));
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", jsonPost({ conversationId: activeRef.current, message: text }));
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      const id = res.headers.get("X-Conversation-Id") ?? "";
      if (id) {
        activeRef.current = id;
        setActiveId(id);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
      loadConvs();
      setTimeout(() => checkLearned(known, id, 0), 4500);
    } catch (e) {
      setError(errText(e));
      setMessages((m) => {
        const last = m[m.length - 1];
        return last?.role === "assistant" && !last.content ? m.slice(0, -1) : m;
      });
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const desktop = window.matchMedia("(pointer: fine)").matches;
    if (desktop && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  const addFact = () =>
    guard(async () => {
      if (!newFact.trim()) return;
      await api("/api/memory", jsonPost({ text: newFact }));
      setNewFact("");
      await loadMemory();
    });

  const removeFact = (id: string) =>
    guard(async () => {
      await api(`/api/memory?id=${id}`, { method: "DELETE" });
      setFacts((f) => f.filter((x) => x.id !== id));
    });

  const addNote = () =>
    guard(async () => {
      if (!noteText.trim()) return;
      await api("/api/notes", jsonPost({ title: noteTitle, text: noteText }));
      setNoteTitle("");
      setNoteText("");
      await loadMemory();
    });

  const removeNote = (id: string) =>
    guard(async () => {
      await api(`/api/notes?id=${id}`, { method: "DELETE" });
      setNotes((n) => n.filter((x) => x.id !== id));
    });

  return (
    <div className="app">
      {chatsOpen && <div className="scrim" onClick={() => setChatsOpen(false)} />}
      <aside className={`chats ${chatsOpen ? "open" : ""}`}>
        <button className="new" onClick={newChat}>New chat</button>
        <nav aria-label="Chats">
          {convs.length === 0 && <p className="hint">Your chats will show up here.</p>}
          {convs.map((c) => (
            <div key={c.id} className={`conv ${c.id === activeId ? "active" : ""}`}>
              <button className="conv-title" onClick={() => openConv(c.id)}>{c.title}</button>
              <button className="conv-del" aria-label={`Delete ${c.title}`} onClick={() => removeConv(c.id)}>×</button>
            </div>
          ))}
        </nav>
      </aside>

      <main className="chat">
        <header>
          <button className="ghost chats-toggle" onClick={() => setChatsOpen(true)}>Chats</button>
          <span className="spacer" />
          <button className="ghost" onClick={() => setMemoryOpen(true)}>
            Memory{facts.length ? ` (${facts.length})` : ""}
          </button>
        </header>

        <div className="scroll">
          <div className="thread">
            {messages.length === 0 && (
              <div className="empty">
                <h1>What's on your mind?</h1>
                <p>I keep what matters from our chats. Add notes under Memory and I'll use them when they're relevant.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.role === "user" ? (
                  <p>{m.content}</p>
                ) : (
                  <>
                    <div className="prose">
                      <ReactMarkdown>{m.content || "Thinking…"}</ReactMarkdown>
                    </div>
                    {m.learned?.map((t) => (
                      <p className="learned" key={t}>Remembered: <mark>{t}</mark></p>
                    ))}
                  </>
                )}
              </div>
            ))}
            {error && <p className="error" role="alert">{error}</p>}
            <div ref={endRef} />
          </div>
        </div>

        <div className="composer">
          <div className="box">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              placeholder="Message"
              aria-label="Message"
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={onKeyDown}
            />
            <button className="primary" onClick={send} disabled={busy || !input.trim()}>Send</button>
          </div>
        </div>
      </main>

      {memoryOpen && <div className="scrim" onClick={() => setMemoryOpen(false)} />}
      <aside className={`memory ${memoryOpen ? "open" : ""}`} inert={!memoryOpen} aria-label="Memory">
        <div className="memory-head">
          <h2>Memory</h2>
          <button className="ghost" onClick={() => setMemoryOpen(false)}>Close</button>
        </div>
        <div className="tabs" role="tablist">
          <button className="tab" role="tab" aria-selected={tab === "facts"} onClick={() => setTab("facts")}>
            What I know
          </button>
          <button className="tab" role="tab" aria-selected={tab === "notes"} onClick={() => setTab("notes")}>
            Notes
          </button>
        </div>

        <div className="memory-body">
          {tab === "facts" ? (
            <>
              {facts.length === 0 && (
                <p>Nothing yet. I'll pick up details as we talk, or you can add one below.</p>
              )}
              <ul className="list">
                {facts.map((f) => (
                  <li key={f.id}>
                    <span className="grow">{f.text}</span>
                    <button className="link-btn" onClick={() => removeFact(f.id)}>Remove</button>
                  </li>
                ))}
              </ul>
              <div className="row">
                <input
                  className="field"
                  value={newFact}
                  placeholder="Add something to remember"
                  aria-label="Add something to remember"
                  onChange={(e) => setNewFact(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addFact()}
                />
                <button className="ghost" onClick={addFact} disabled={!newFact.trim()}>Add</button>
              </div>
            </>
          ) : (
            <>
              <p>Paste text I should draw on when it's relevant: journals, documents, project specs.</p>
              <input
                className="field"
                value={noteTitle}
                placeholder="Title"
                aria-label="Note title"
                onChange={(e) => setNoteTitle(e.target.value)}
              />
              <textarea
                className="field"
                value={noteText}
                placeholder="Paste your text here"
                aria-label="Note text"
                onChange={(e) => setNoteText(e.target.value)}
              />
              <button className="primary" onClick={addNote} disabled={!noteText.trim()}>Save note</button>
              <ul className="list" style={{ marginTop: "1.25rem" }}>
                {notes.map((n) => (
                  <li key={n.id}>
                    <span className="grow">
                      {n.title}
                      <small>{n.chars.toLocaleString()} characters</small>
                    </span>
                    <button className="link-btn" onClick={() => removeNote(n.id)}>Remove</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="memory-foot">
          <a href="/api/export" download>Download chats as training data</a>
          <div>JSONL, ready for fine-tuning elsewhere.</div>
        </div>
      </aside>
    </div>
  );
}
