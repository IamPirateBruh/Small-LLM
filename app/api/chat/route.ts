import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import {
  addFacts,
  getConversation,
  getFacts,
  retrieve,
  saveConversation,
  type Conversation,
} from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const MODEL = process.env.MODEL ?? "claude-sonnet-5-5";
const FAST_MODEL = process.env.MODEL_FAST ?? "claude-haiku-5-5";

function buildSystem(facts: string[], notes: { title: string; text: string }[]) {
  const parts = [
    "You are a personal assistant that gets better the longer you talk with this person. " +
      "Be direct, warm and concise. Use what you know about them when it helps, but don't recite it back unprompted. " +
      "If you're unsure a remembered detail is still true, ask.",
  ];
  if (facts.length) {
    parts.push("What you've learned about the person so far:\n" + facts.map((f) => `- ${f}`).join("\n"));
  }
  if (notes.length) {
    parts.push(
      "Excerpts from the person's own notes that may be relevant (use them to answer; say so if they don't cover the question):\n" +
        notes.map((n) => `[${n.title}]\n${n.text}`).join("\n\n")
    );
  }
  return parts.join("\n\n");
}

// Runs after the reply is sent: pulls durable facts out of the exchange and stores them.
async function learn(userText: string, reply: string, known: string[]) {
  try {
    const res = await client.messages.create({
      model: FAST_MODEL,
      max_tokens: 400,
      system:
        "You maintain a long-term memory about one person. From the exchange below, extract NEW durable facts about the person: " +
        "preferences, projects, skills, goals, and context that will still be useful in future chats. " +
        "Skip anything temporary or already known, and never store passwords, API keys, or ID or card numbers. " +
        "Reply with only a JSON array of up to 3 short strings, or [] if nothing is worth keeping.",
      messages: [
        {
          role: "user",
          content:
            `Already known:\n${known.map((k) => `- ${k}`).join("\n") || "(nothing yet)"}\n\n` +
            `Person: ${userText}\n\nAssistant: ${reply.slice(0, 1500)}`,
        },
      ],
    });
    const raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return;
    const parsed: unknown = JSON.parse(match[0]);
    if (Array.isArray(parsed)) {
      await addFacts(parsed.filter((x): x is string => typeof x === "string").slice(0, 3));
    }
  } catch (e) {
    console.error("learn failed", e);
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { conversationId?: string; message?: string };
  const text = body.message?.trim();
  if (!text) return Response.json({ error: "Message is empty." }, { status: 400 });

  let loaded = body.conversationId ? await getConversation(body.conversationId) : null;
  if (!loaded) {
    loaded = { id: crypto.randomUUID(), title: text.slice(0, 48), messages: [], updatedAt: Date.now() };
  }
  const conv: Conversation = loaded;
  conv.messages.push({ role: "user", content: text });

  const [facts, notes] = await Promise.all([getFacts(), retrieve(text)]);
  const knownFacts = facts.map((f) => f.text).slice(-80);

  let history = conv.messages.slice(-40);
  if (history[0]?.role === "assistant") history = history.slice(1);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1500,
    system: buildSystem(knownFacts, notes),
    messages: history,
  });

  let resolveDone: (reply: string) => void = () => {};
  const finished = new Promise<string>((res) => {
    resolveDone = res;
  });
  after(async () => {
    const reply = await finished;
    if (reply) await learn(text, reply, knownFacts);
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            full += ev.delta.text;
            controller.enqueue(encoder.encode(ev.delta.text));
          }
        }
        conv.messages.push({ role: "assistant", content: full });
        await saveConversation(conv);
        controller.close();
        resolveDone(full);
      } catch (e) {
        console.error("chat failed", e);
        controller.error(e);
        resolveDone("");
      }
    },
    cancel() {
      stream.abort();
      resolveDone("");
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Conversation-Id": conv.id,
    },
  });
}
