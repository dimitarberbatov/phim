// Nuvio Local Scraper Plugin for RoPhim (rophim10.tv) - Optimized v2
const BASE_URL = "https://rophim10.tv";
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": BASE_URL + "/",
  "Origin": BASE_URL,
  "Accept": "application/json, text/plain, */*"
};

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function getTmdbInfo(tmdbId, mediaType) {
  const type = (mediaType === "tv" || mediaType === "series") ? "tv" : "movie";
  try {
    const data = await fetchJson(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=vi-VN`);
    return {
      titleVi: data.title || data.name || "",
      originalTitle: data.original_title || data.original_name || ""
    };
  } catch (e) {
    return { titleVi: "", originalTitle: "" };
  }
}

async function getStreams(tmdbId, mediaType = "movie", season = 1, episode = 1) {
  try {
    const info = await getTmdbInfo(tmdbId, mediaType);
    const keyword = info.titleVi || info.originalTitle;
    if (!keyword) return [];

    // Tìm kiếm trực tiếp qua trang chủ hoặc cơ chế search của web
    const searchUrl = `${BASE_URL}/tim-kiem?keyword=${encodeURIComponent(keyword)}`;
    const html = await fetchText(searchUrl);

    // Lấy link trang phim đầu tiên tìm được
    const matchLink = html.match(/href="(\/phim\/[^"]+)"/);
    if (!matchLink) return [];

    const movieUrl = BASE_URL + matchLink[1];
    const watchUrl = movieUrl.replace("/phim/", "/xem-phim/");
    
    // Nếu là phim bộ, ghép thêm tham số tập
    const finalWatchUrl = (mediaType === "tv" || mediaType === "series") 
      ? `${watchUrl}?ver=1&ss=${season}&ep=${episode}` 
      : watchUrl;

    const watchHtml = await fetchText(finalWatchUrl);
    
    // Quét toàn bộ link m3u8 có trong trang xem phim
    const m3u8Matches = watchHtml.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g) || [];
    const uniqueStreams = [...new Set(m3u8Matches)];

    return uniqueStreams.map((link, index) => ({
      name: "RoPhim",
      title: `RoPhim - Server ${index + 1} (1080p)`,
      url: link.replace(/\\u002F/g, "/").replace(/\\/g, ""),
      quality: "1080p",
      headers: {
        "Referer": BASE_URL + "/",
        "Origin": BASE_URL,
        "User-Agent": HEADERS["User-Agent"]
      }
    }));
  } catch (err) {
    console.error("[RoPhim Error]:", err);
    return [];
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
}
