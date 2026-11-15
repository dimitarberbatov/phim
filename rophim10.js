// Nuvio Local Scraper - RoPhim Legacy Compatible
var BASE_URL = "https://rophim10.tv";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var type = (mediaType === "tv" || mediaType === "series") ? "tv" : "movie";
    var tmdbUrl = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=vi-VN";
    
    var tmdbRes = fetch(tmdbUrl);
    var tmdbData = JSON.parse(tmdbRes.text());
    var title = tmdbData.title || tmdbData.name || "";
    
    if (!title) return [];

    var searchUrl = BASE_URL + "/tim-kiem?keyword=" + encodeURIComponent(title);
    var searchRes = fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": BASE_URL + "/"
      }
    });
    
    var html = searchRes.text();
    var match = html.match(/href="(\/phim\/[^"]+)"/);
    if (!match) return [];

    var watchUrl = BASE_URL + match[1].replace("/phim/", "/xem-phim/");
    if (mediaType === "tv" || mediaType === "series") {
      watchUrl = watchUrl + "?ver=1&ss=" + (season || 1) + "&ep=" + (episode || 1);
    }

    var watchRes = fetch(watchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": BASE_URL + "/"
      }
    });
    
    var watchHtml = watchRes.text();
    var m3u8Regex = /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g;
    var matches = watchHtml.match(m3u8Regex);
    
    if (!matches || matches.length === 0) return [];

    var streams = [];
    var checked = {};
    
    for (var i = 0; i < matches.length; i++) {
      var link = matches[i].replace(/\\u002F/g, "/").replace(/\\/g, "");
      if (!checked[link]) {
        checked[link] = true;
        streams.push({
          name: "RoPhim",
          title: "RoPhim - Server " + (streams.length + 1) + " (1080p)",
          url: link,
          quality: "1080p",
          headers: {
            "Referer": BASE_URL + "/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
      }
    }
    
    return streams;
  } catch (e) {
    return [];
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
}
