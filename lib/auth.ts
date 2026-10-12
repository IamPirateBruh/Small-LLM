export const COOKIE = "lc_auth";

// Works in both the Edge runtime (middleware) and Node (API routes).
export async function authToken(): Promise<string> {
  const data = new TextEncoder().encode(
    `${process.env.APP_PASSWORD ?? ""}:${process.env.AUTH_SECRET ?? ""}`
  );
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
