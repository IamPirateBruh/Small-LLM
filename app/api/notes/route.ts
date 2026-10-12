import { NextResponse } from "next/server";
import { addNote, deleteNote } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { title, text } = (await req.json().catch(() => ({}))) as { title?: string; text?: string };
  const clean = String(text ?? "").trim().slice(0, 100_000);
  if (!clean) return NextResponse.json({ error: "Note is empty." }, { status: 400 });
  await addNote(String(title ?? ""), clean);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await deleteNote(id);
  return NextResponse.json({ ok: true });
}
