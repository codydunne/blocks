var {AsyncLocalStorage} = require('node:async_hooks')

var FRESH = 15*60*1000 // ms; an older hit is still served, and refreshed in the background
var KEEP = 30*24*60*60 // seconds a stale entry stays servable; Cloudflare may evict sooner

// per request: {bust, ctx}
var context = new AsyncLocalStorage()

module.exports = async function(url, type, token=''){
  // a visitor's ?token= can list their secret gists: never store or serve those from the shared cache
  // Cache API: per data centre, so each location warms separately
  var store = token ? null : globalThis.caches?.default
  var {bust, ctx} = context.getStore() || {}

  var load = async refreshing => {
    console.log(url, type)

    // GitHub's API rejects requests without a User-Agent, and Workers send none
    var headers = {'User-Agent': 'blocks'}
    var auth = token || module.exports.defaultToken
    // the token only buys API rate limit; raw gist hosts don't need it
    if (auth && url.startsWith('https://api.github.com/')) headers.Authorization = 'token ' + auth

    var res = await fetch(url, {headers})
    // first-time errors are cached too: a missing gist should not cost a GitHub request per hit.
    // a failed refresh (rate limit, outage) must not replace a good entry
    if (res.ok || !refreshing){
      await store?.put(url, new Response(res.clone().body, {headers: {'Cache-Control': 'max-age=' + KEEP, 'X-Fetched': Date.now()}}))
    }
    return res
  }

  var hit = !bust && await store?.match(url)
  if (!hit) return (await load())[type]()

  if (Date.now() - hit.headers.get('X-Fetched') > FRESH){
    // shortcut: concurrent stale hits each refetch, dedupe if traffic ever makes that matter
    var refresh = load(true).catch(e => console.log('refresh failed', e))
    ctx?.waitUntil(refresh)
  }
  return hit[type]()
}

// set per request from the Worker's GITHUB_TOKEN secret
module.exports.defaultToken = ''

// store: {bust, ctx}. bust (?cachebust) skips the cache read and overwrites the entry
module.exports.run = (store, fn) => context.run(store, fn)
