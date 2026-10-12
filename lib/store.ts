import { redis } from "./redis";

export type Msg = { role: "user" | "assistant"; content: string };
export type Conversation = { id: string; title: string; messages: Msg[]; updatedAt: number };
export type ConvMeta = { id: string; title: string; updatedAt: number };
export type Fact = { id: string; text: string; createdAt: number };
export type Note = { id: string; title: string; chunks: string[]; createdAt: number };

/* ---------- Conversations ---------- */

export async function getConversation(id: string): Promise<Conversation | null> {
  return (await redis().get<Conversation>(`conv:${id}`)) ?? null;
}

export async function saveConversation(c: Conversation): Promise<void> {
  c.updatedAt = Date.now();
  const r = redis();
  const meta: ConvMeta = { id: c.id, title: c.title, updatedAt: c.updatedAt };
  await Promise.all([r.set(`conv:${c.id}`, c), r.hset("conv:meta", { [c.id]: meta })]);
}

export async function listConversations(): Promise<ConvMeta[]> {
  const all = await redis().hgetall<Record<string, ConvMeta>>("conv:meta");
  return Object.values(all ?? {})
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 100);
}

export async function deleteConversation(id: string): Promise<void> {
  const r = redis();
  await Promise.all([r.del(`conv:${id}`), r.hdel("conv:meta", id)]);
}

export async function getAllConversations(): Promise<Conversation[]> {
  const r = redis();
  const meta = await r.hgetall<Record<string, ConvMeta>>("conv:meta");
  const ids = Object.keys(meta ?? {});
  if (!ids.length) return [];
  const convs = await r.mget<(Conversation | null)[]>(...ids.map((i) => `conv:${i}`));
  return convs.filter((c): c is Conversation => !!c).sort((a, b) => a.updatedAt - b.updatedAt);
}

/* ---------- Facts the assistant has learned ---------- */

export async function getFacts(): Promise<Fact[]> {
  const all = await redis().hgetall<Record<string, Fact>>("facts");
  return Object.values(all ?? {}).sort((a, b) => a.createdAt - b.createdAt);
}

export async function addFacts(texts: string[]): Promise<Fact[]> {
  const existing = new Set((await getFacts()).map((f) => f.text.toLowerCase()));
  const fresh = texts
    .map((t) => t.trim())
    .filter((t, i, arr) => t && !existing.has(t.toLowerCase()) && arr.indexOf(t) === i);
  if (!fresh.length) return [];
  const now = Date.now();
  const facts: Fact[] = fresh.map((text, i) => ({ id: crypto.randomUUID(), text, createdAt: now + i }));
  await redis().hset("facts", Object.fromEntries(facts.map((f) => [f.id, f])));
  return facts;
}

export async function deleteFact(id: string): Promise<void> {
  await redis().hdel("facts", id);
}

/* ---------- Notes (your own documents) ---------- */

function chunk(text: string, size = 900): string[] {
  const out: string[] = [];
  let cur = "";
  for (const para of text.split(/\n{2,}/)) {
    if (cur && (cur + "\n\n" + para).length > size) {
      out.push(cur.trim());
      cur = para;
    } else {
      cur = cur ? cur + "\n\n" + para : para;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) =>
    c.length <= size * 1.5 ? [c] : c.match(new RegExp(`[\\s\\S]{1,${size}}`, "g")) ?? [c]
  );
}

export async function getNotes(): Promise<Note[]> {
  const all = await redis().hgetall<Record<string, Note>>("notes");
  return Object.values(all ?? {}).sort((a, b) => a.createdAt - b.createdAt);
}

export async function addNote(title: string, text: string): Promise<Note> {
  const note: Note = {
    id: crypto.randomUUID(),
    title: title.trim().slice(0, 80) || "Untitled note",
    chunks: chunk(text),
    createdAt: Date.now(),
  };
  await redis().hset("notes", { [note.id]: note });
  return note;
}

export async function deleteNote(id: string): Promise<void> {
  await redis().hdel("notes", id);
}

/* ---------- Retrieval: keyword scoring over note chunks ---------- */

const STOP = new Set(
  ("the and for that this with you are was what how can have not but your from about will would there " +
    "their been has had its into than then them they she him her his who why when where which just like " +
    "some any all out get got did does too very is of to in on it at be as an or if do my me we so no up")
    .split(" ")
);

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w));

export async function retrieve(query: string, k = 4): Promise<{ title: string; text: string }[]> {
  const q = new Set(tokenize(query));
  if (!q.size) return [];
  const notes = await getNotes();
  const docs = notes.flatMap((n) => n.chunks.map((text) => ({ title: n.title, text, terms: tokenize(text) })));
  if (!docs.length) return [];

  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.terms)) df.set(t, (df.get(t) ?? 0) + 1);

  return docs
    .map((d) => {
      const tf = new Map<string, number>();
      for (const t of d.terms) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (f) score += (1 + Math.log(f)) * Math.log(1 + docs.length / (df.get(t) ?? 1));
      }
      return { d, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => ({ title: x.d.title, text: x.d.text }));
}
