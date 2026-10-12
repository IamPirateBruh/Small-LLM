# Learning chat

A private chat assistant that gets better the more you use it. Runs on Vercel.

## How it learns

Vercel is serverless, so it can't train model weights. Instead the app learns the way most
production assistants do:

1. **Memory.** After each reply, a small model extracts durable facts about you (preferences,
   projects, goals) and stores them. Every future chat starts with those facts. You can see,
   add, and remove them under **Memory**.
2. **Your data.** Paste documents under **Memory → Notes**. They're split into chunks, and the
   most relevant ones are pulled into the prompt whenever you ask something related.
3. **Training data export.** **Download chats as training data** gives you a `chats.jsonl` file
   (chat format) you can use to fine-tune a model on a platform that supports it.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in:
   - `ANTHROPIC_API_KEY` from console.anthropic.com
   - `APP_PASSWORD` is the password you'll sign in with
   - `AUTH_SECRET` is any long random string (`openssl rand -hex 32`)
   - Redis: create a free Upstash Redis database (Vercel dashboard → Storage → Upstash Redis),
     which fills in the Redis variables for you on Vercel. For local dev, copy the REST URL and
     token into `.env.local`.
3. `npm run dev` and open http://localhost:3000

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel, **Add New → Project**, import the repo.
3. Add `ANTHROPIC_API_KEY`, `APP_PASSWORD`, and `AUTH_SECRET` under Environment Variables, and
   connect the Upstash Redis database to the project.
4. Deploy.

## Notes

- The whole app sits behind your password, because anyone with the URL could otherwise spend
  your API credits and read your data.
- Retrieval is keyword-based to keep setup simple. For large note collections, swap `retrieve()`
  in `lib/store.ts` for an embeddings search (for example Upstash Vector or Postgres with pgvector).
- Models are set with `MODEL` and `MODEL_FAST` in your environment variables.
