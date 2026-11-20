import about from './routes/about.js'
import user from './routes/user.js'
import block from './routes/block.js'
import raw from './routes/raw.js'
import fetchCache from './lib/fetch-cache.js'

var notFound = () => new Response('', {status: 404})

export default {
  fetch(request, env, ctx) {
    // ?cachebust on any page refetches what that page needs and overwrites its cache entries
    var bust = new URL(request.url).searchParams.has('cachebust')
    return fetchCache.run({bust, ctx}, () => route(request, env))
  },
}

async function route(request, env) {
  if (request.method != 'GET' && request.method != 'HEAD') return new Response('', {status: 405})

  fetchCache.defaultToken = env.GITHUB_TOKEN || ''

  var url = new URL(request.url)
  var query = Object.fromEntries(url.searchParams)

  // segments stay percent-encoded: they are interpolated into GitHub URLs
  var [a, b, c, d, ...rest] = url.pathname.split('/').filter(Boolean)
  if (rest.length) return notFound()

  if (!a) return about()
  if (a == 'static') return b && !c ? env.ASSETS.fetch(new URL('/' + b, url)) : notFound()
  if (!b) return user({params: {user: a}, query})
  if (!c) return block({params: {user: a, id: b}, query})
  if (b != 'raw') return notFound()

  // a gist's relative URLs only resolve against a trailing slash
  if (!d && !url.pathname.endsWith('/')) {
    return new Response(null, {status: 302, headers: {Location: url.pathname + '/' + url.search}})
  }
  return raw({params: {user: a, id: c, file: d}})
}
