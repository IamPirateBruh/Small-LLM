import { getAllConversations } from "@/lib/store";

export const dynamic = "force-dynamic";

// One JSON object per line: {"messages":[{"role":"user",...},{"role":"assistant",...}]}
// This is the chat format most fine-tuning services accept.
export async function GET() {
  const convs = await getAllConversations();
  const lines = convs
    .filter((c) => c.messages.length >= 2)
    .map((c) => JSON.stringify({ messages: c.messages }));
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "application/jsonl; charset=utf-8",
      "Content-Disposition": 'attachment; filename="chats.jsonl"',
    },
  });
}
