import test from 'node:test'
import assert from 'node:assert/strict'
import worker from './worker.js'

var background = []
var ctx = {waitUntil: p => background.push(p)}
var get = path => worker.fetch(new Request('http://x' + path), {GITHUB_TOKEN: 'tok'}, ctx)

test('routing', async () => {
  var calls = []
  globalThis.fetch = async (url, opts) => {
    calls.push({url, headers: opts?.headers})
    if (url.includes('/users/')) return Response.json([{id: 'abc', description: 'hi <b>', public: true}])
    if (url.includes('/gists/')) return Response.json({description: 'd', files: {'index.html': {size: 1}}})
    return new Response('see http://a.b')
  }

  var res = await get('/')
  assert.equal(res.status, 200)
  assert.match(await res.text(), /Add your username/)

  res = await get('/u')
  assert.match(await res.text(), /href="\/u\/abc"[^]*hi &lt;b&gt;/)
  assert.equal(calls[0].headers.Authorization, 'token tok')
  assert.ok(calls[0].headers['User-Agent'])

  res = await get('/u/abc')
  assert.match(await res.text(), /src='\/u\/raw\/abc\/index.html'/)

  res = await get('/u/raw/abc?x=1')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('Location'), '/u/raw/abc/?x=1')

  res = await get('/u/raw/abc/')
  assert.equal(res.headers.get('Content-Type'), 'text/html')
  assert.equal(await res.text(), 'see //a.b')
  // the token must not leak to the raw host
  assert.equal(calls.at(-1).headers.Authorization, undefined)

  res = await get('/u/raw/abc/a.js')
  assert.match(res.headers.get('Content-Type'), /javascript/)

  assert.equal((await get('/u/raw/abc/a/b')).status, 404)
  assert.equal((await worker.fetch(new Request('http://x/', {method: 'POST'}), {})).status, 405)
})

test('fetch cache', async () => {
  var store = new Map(), upstream = 0
  globalThis.caches = {default: {
    match: async url => store.get(url)?.clone(),
    put: async (url, res) => void store.set(url, res),
  }}
  globalThis.fetch = async url => Response.json(url.includes('/gists') ? [{id: 'g' + ++upstream, public: true}] : {public_gists: 1})
  var body = async path => (await get(path)).text()

  assert.match(await body('/u'), /\/u\/g1"/)
  assert.match(await body('/u'), /\/u\/g1"/)
  assert.equal(upstream, 1)

  // a visitor's token neither reads nor writes the shared cache
  assert.match(await body('/u?token=secret'), /\/u\/g2"/)
  assert.match(await body('/u'), /\/u\/g1"/)
  assert.deepEqual([...store.keys()].filter(d => d.includes('/gists')), ['https://api.github.com/users/u/gists?page=1&per_page=100'])

  assert.match(await body('/u?cachebust=1'), /\/u\/g3"/)
  assert.match(await body('/u'), /\/u\/g3"/)

  // stale: served as is, refreshed in the background
  var key = [...store.keys()].find(d => d.includes('/gists'))
  var age = t => store.set(key, new Response(store.get(key).body, {headers: {'X-Fetched': t}}))
  age(0)
  assert.match(await body('/u'), /\/u\/g3"/)
  await Promise.all(background)
  assert.match(await body('/u'), /\/u\/g4"/)

  // a failed refresh keeps the good entry
  age(0)
  globalThis.fetch = async () => new Response('{}', {status: 403})
  await body('/u')
  await Promise.all(background)
  assert.match(await body('/u'), /\/u\/g4"/)

  // the gist count decides how many pages load, all at once
  var pages = []
  globalThis.fetch = async url => {
    if (!url.includes('/gists')) return Response.json({public_gists: 250})
    pages.push(url)
    return Response.json(Array(url.includes('page=3&') ? 50 : 100).fill({id: 'a'}))
  }
  await body('/big')
  assert.equal(pages.length, 3)

  // a full last page (secret gists, stale count) pulls the rest
  pages = []
  globalThis.fetch = async url => {
    if (!url.includes('/gists')) return Response.json({public_gists: 1})
    pages.push(url)
    return Response.json(Array(url.includes('page=1&') ? 100 : 0).fill({id: 'a'}))
  }
  await body('/secret?token=t')
  assert.equal(pages.length, 10)
  delete globalThis.caches
})
