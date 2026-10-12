import { NextResponse } from "next/server";
import { deleteConversation, getConversation } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await deleteConversation(id);
  return NextResponse.json({ ok: true });
}
