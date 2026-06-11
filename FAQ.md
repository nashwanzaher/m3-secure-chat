# FAQ

### Why a proxy? Why not call M3 from the browser?

Calling M3 from the browser would require shipping your `M3_API_KEY` in
the JavaScript bundle — meaning anyone could read it from DevTools and
abuse it. The proxy holds the key in an environment variable and adds
CORS, rate limiting, and a single place to add auth, logging, and
caching later.

### Is the per-user key I set in the UI safe?

It is base64-obfuscated in `localStorage`. That's *not* encryption — a
determined user can read it. Treat the per-user key as a low-trust
identifier (e.g. a "bring your own key" feature) rather than a secret.
The real protection is the master key staying in the proxy.

### How much does a chat cost?

The UI estimates cost at **$0.001 / 1k input tokens** and
**$0.002 / 1k output tokens**. Adjust the constants in
`src/lib/api.ts → addUsage` to match your contract. The proxy logs
`usage` from M3 so you can verify the estimate.

### Can I run this fully offline / on-prem?

Yes. The proxy talks to whatever URL you set in `M3_BASE_URL`. Point it
at an internal M3-compatible endpoint (e.g. vLLM, LM Studio,
text-generation-inference) and you're set.

### Does the proxy stream responses?

Not by default — the bundled `proxy/main.py` returns the full JSON. To
add streaming, set `stream: true` in the request and proxy the SSE
response back to the browser. The UI already supports an
`AbortController` for cancellation.

### How do I rotate my M3_API_KEY?

1. In M3's console, revoke the old key and mint a new one.
2. Update the secret in your hosting platform (Render env, Fly secret,
   Cloud Run secret, etc.) — or rotate the GitHub Secret and re-deploy.
3. The proxy picks it up on restart; no browser change is needed.

### Why does the proxy return "Proxy error 429" sometimes?

That's our rate limiter. Default is 60 req/min per IP. Tune with the
`RATE_LIMIT_PER_MIN` env var, or put a real auth layer in front
(Cloudflare Access, Auth0, etc.).

### Can I deploy the SPA without a proxy to test the UI?

Yes — open the app, leave the **Proxy URL** field empty, and the UI
enters **Demo Mode**. You'll see formatted responses, markdown,
streaming reveal, and the usage dashboard, but the assistant will echo
your input instead of calling M3.

### How do I customize the system prompt / model parameters?

In the deployed UI: **Settings** tab. Both are saved in `localStorage`
and sent on every request. Default model is `MiniMax-M3`.

### Is there a dark mode?

Yes — the app uses Tailwind's `dark:` modifiers and follows the
system preference by default.

### Where does the security checklist in the UI come from?

It's the same list at the top of `README.md`, surfaced as a card on
the **Security** tab so non-developers can see what's been hardened.

### How do I report a vulnerability?

See [`SECURITY.md`](./SECURITY.md). Please do **not** file a public
issue.
