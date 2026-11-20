var fetchCache = require('./../lib/fetch-cache')
var _ = require('underscore')
var d3 = require('d3')

var e = _.escape

async function dlGists(user, token=''){
  var maxPages = 10
  var page = p => fetchCache(`https://api.github.com/users/${user}/gists?page=${p}&per_page=100`, 'json', token)

  // GitHub takes ~3.5 s per full page, so ask for the gist count first (fast) and load every page at once
  var info = await fetchCache(`https://api.github.com/users/${user}`, 'json')
  var n = Math.min(Math.ceil(info.public_gists / 100) || 1, maxPages)
  var pages = await Promise.all(d3.range(1, n + 1).map(page))

  // the count misses secret gists (?token=) and can be stale: a full last page means there are more
  if (pages[n - 1].length == 100) pages.push(...await Promise.all(d3.range(n + 1, maxPages + 1).map(page)))

  return _.flatten(pages)
    .map(d => ({id: d.id, description: d.description, public: d.public}))
    .filter(d => d.id)
    .filter((d) => !d.description?.match(/unlisted/i));
}

function generateHTML(user, gists){
  var title =  `blocks by ${e(user)}`
  var titleURL =  `<a href='/'>blocks</a> by  ${e(user)}`

  return `<!DOCTYPE html>
  <meta charset='utf-8'>
  <link rel="icon" href="data:;base64,iVBORw0KGgo=">
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <link rel='stylesheet' href='/static/style.css'>
  <title>${title}</title>
  <div class='username'>${titleURL}</div>

  <div id='gist-list'>
  ${gists.filter(d => d && d.id).map(gist => `
    <a class="block-thumb ${gist.public ? '' : 'block-private'}"
      href="/${user}/${gist.id}">
      <img loading="lazy" alt="" src="https://gist.githubusercontent.com/${user}/${gist.id}/raw/thumbnail.png">
      <p>${gist.public ? '' : '🔒 '}${e(gist.description || gist.id.substr(0, 20))}</p>
    </a>
  `).join(' ')}
  </div>
  `
}

module.exports = async function get(req) {
  var user = req.params.user
  var token = req.query.token || ''
  var gists = await dlGists(user, token)

  // redirect if user doesn't exist and there's a gist id with their user name
  // /397f1b0905400b83fcea4008fb4ccdb1 -> /1wheel/397f1b0905400b83fcea4008fb4ccdb1
  if (!gists.length){
    var url = `https://api.github.com/gists/${user}`
    var gist = await fetchCache(url, 'json')

    if (gist && gist.owner){
      return new Response('', {status: 301, headers: {Location: `/${gist.owner.login}/${user}`}})
    }
  }

  var html = generateHTML(user, gists)
  return new Response(html, {headers: {'Content-Type': 'text/html'}})
}
