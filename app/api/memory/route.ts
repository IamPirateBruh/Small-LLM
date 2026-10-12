import { NextResponse } from "next/server";
import { addFacts, deleteFact, getFacts, getNotes } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const [facts, notes] = await Promise.all([getFacts(), getNotes()]);
  return NextResponse.json({
    facts: facts.map(({ id, text }) => ({ id, text })),
    notes: notes.map((n) => ({ id: n.id, title: n.title, chars: n.chunks.join("").length })),
  });
}

export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const clean = String(text ?? "").trim().slice(0, 300);
  if (!clean) return NextResponse.json({ error: "Nothing to remember." }, { status: 400 });
  await addFacts([clean]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await deleteFact(id);
  return NextResponse.json({ ok: true });
}
