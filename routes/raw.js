const fetchCache = require("./../lib/fetch-cache");
const mime = require("mime-types");

module.exports = async function get(req) {
  const { user, id } = req.params;
  const file = req.params.file || 'index.html';

  const url = `https://gist.githubusercontent.com/${user}/${id}/raw/${file}`;
  try {
    const type = mime.lookup(file) || '';
    if (type.match(/^image/)) return await fetch(url);

    let text = await fetchCache(url, "text");
    if (file.includes(".html")) text = text.replace(/http:\/\//g, "//");

    return new Response(text, {
      headers: {
        "Content-Type": type || "text/plain",
        "Cache-Control": "public, max-age=" + 1000 * 60,
      },
    });
  } catch (e) {
    console.log("missing", e);
    return new Response("", { status: 404 });
  }
};
