Open source clone of [bl.ocks.org](https://bl.ocks.org/), forked from [chart-code/blocks](https://github.com/chart-code/blocks) and ported to a Cloudflare Worker.

# dev

`pnpm install && pnpm dev`, then open http://localhost:8787/$username.

`pnpm test` runs the routing and cache tests.

# deploy

`pnpm run deploy` publishes to [blocks.dunne.dev](https://blocks.dunne.dev) and uploads `GITHUB_TOKEN` from `.env` as a Worker secret.
`.env` (gitignored) needs two unquoted lines:

```
CLOUDFLARE_API_TOKEN=...
GITHUB_TOKEN=...
```

`CLOUDFLARE_API_TOKEN` needs the "Edit Cloudflare Workers" permissions on the account and the `dunne.dev` zone.

`GITHUB_TOKEN` raises the GitHub API rate limit, which is otherwise 60 requests per hour shared with other Workers.
Use a token with **no scopes or permissions**: the Worker sends it on every API request, so a token with gist access would list its owner's secret gists publicly at `/$username`.
`pnpm dev` reads the same `.env`.

To view your own secret gists, pass a token per request: `/$username?token=$token`.

# caching

Responses from GitHub are cached at the Cloudflare edge, per data centre.
A cached copy is served immediately; one older than 15 minutes is also refreshed in the background, so an edit to a gist shows up one visit after the visit that triggers the refresh.
Requests with `?token=` are never cached.

To see a change right away, add `?cachebust` to the page: `/$username?cachebust` or `/$username/$gistId?cachebust`.
It refetches only what that page itself loads, in the data centre that serves you.
A block's files are separate requests, so refresh them with `/$username/raw/$gistId/$file?cachebust` (omit `$file` for `index.html`).
Browsers also cache those files for up to 60000 seconds, so follow with a hard reload of the block page.

Gist HTML is served from the Worker's own origin, so host it on a domain that shares no cookies with anything sensitive.
