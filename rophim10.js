// Nuvio Local Scraper Plugin for RoPhim (rophim10.tv)
// Chuẩn Nuvio Media / Local Plugin Architecture (getStreams)

const BASE_URL = "https://rophim10.tv";
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; // TMDB public read key fallback

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: BASE_URL + "/",
  Origin: BASE_URL,
  Accept: "application/json, text/plain, */*",
};

function normalizeTitle(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }
  return (2 * common) / (wordsA.size + wordsB.size);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...HEADERS, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchText(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...HEADERS, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function getTmdbInfo(tmdbId, mediaType) {
  const type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
  try {
    const data = await fetchJson(
      `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=vi-VN`
    );
    const enData = await fetchJson(
      `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`
    );
    return {
      titleVi: data.title || data.name || "",
      titleEn: enData.title || enData.name || data.original_title || data.original_name || "",
      originalTitle: data.original_title || data.original_name || "",
      year: (data.release_date || data.first_air_date || "").slice(0, 4),
    };
  } catch (e) {
    return { titleVi: "", titleEn: "", originalTitle: "", year: "" };
  }
}

async function searchRoPhim(keyword) {
  if (!keyword) return [];
  const encoded = encodeURIComponent(keyword);

  // 1. Thử các endpoint API tìm kiếm phổ biến của RoPhim
  const apiCandidates = [
    `${BASE_URL}/api/v1/movie/search?keyword=${encoded}&limit=20`,
    `${BASE_URL}/api/movie/search?q=${encoded}`,
    `${BASE_URL}/api/search?keyword=${encoded}`,
  ];

  for (const apiUrl of apiCandidates) {
    try {
      const json = await fetchJson(apiUrl);
      const list =
        json?.result?.items ||
        json?.data?.items ||
        json?.items ||
        json?.data ||
        (Array.isArray(json) ? json : null);
      if (Array.isArray(list) && list.length > 0) {
        return list.map((item) => ({
          id: item._id || item.id || item.public_id || "",
          slug: item.slug || "",
          title: item.title || item.name || "",
          originalTitle: item.english_title || item.origin_name || item.original_title || "",
          year: String(item.release_year || item.year || ""),
          url: item.slug
            ? `${BASE_URL}/phim/${item.slug}${item.public_id ? "." + item.public_id : ""}`
            : "",
        }));
      }
    } catch (_) {}
  }

  // 2. Fallback: Scrape trang tìm kiếm HTML của RoPhim
  try {
    const html = await fetchText(`${BASE_URL}/tim-kiem?keyword=${encoded}`);
    const results = [];
    // Parse thẻ link phim dạng /phim/slug.id hoặc /phim/slug
    const linkRegex = /href=["'](\/phim\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const seen = new Set();
    while ((match = linkRegex.exec(html)) !== null) {
      const path = match[1];
      if (seen.has(path)) continue;
      seen.add(path);
      const rawText = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (rawText && rawText.length > 1) {
        const slugPart = path.replace(/^\/phim\//, "");
        const dotIdx = slugPart.lastIndexOf(".");
        results.push({
          id: dotIdx !== -1 ? slugPart.slice(dotIdx + 1) : slugPart,
          slug: dotIdx !== -1 ? slugPart.slice(0, dotIdx) : slugPart,
          title: rawText,
          originalTitle: rawText,
          year: "",
          url: `${BASE_URL}${path}`,
        });
      }
    }
    return results;
  } catch (e) {
    console.error("[RoPhim] Search fallback error:", e.message);
    return [];
  }
}

async function extractStreamsFromPage(movieItem, mediaType, season, episode) {
  const streams = [];
  const isTv = mediaType === "tv" || mediaType === "series";

  // 1. Thử gọi API chi tiết phim / lấy link m3u8 nếu RoPhim trả về JSON
  if (movieItem.id || movieItem.slug) {
    const detailApis = [
      `${BASE_URL}/api/v1/movie/detail/${movieItem.id || movieItem.slug}`,
      `${BASE_URL}/api/v1/movie/${movieItem.slug}/episodes`,
    ];
    for (const api of detailApis) {
      try {
        const data = await fetchJson(api);
        const rawStr = JSON.stringify(data);
        const m3u8Matches = rawStr.match(/https?:\/\/[^"\\s]+\.m3u8[^"\\s]*/g);
        if (m3u8Matches) {
          for (const link of [...new Set(m3u8Matches)]) {
            streams.push({
              name: "RoPhim",
              title: `${movieItem.title} - HLS Auto`,
              url: link,
              quality: "1080p",
              headers: {
                Referer: BASE_URL + "/",
                Origin: BASE_URL,
                "User-Agent": HEADERS["User-Agent"],
              },
            });
          }
        }
      } catch (_) {}
    }
  }

  // 2. Scrape trực tiếp trang xem phim (/xem-phim/...)
  if (streams.length === 0 && movieItem.url) {
    try {
      let watchUrl = movieItem.url.replace("/phim/", "/xem-phim/");
      if (isTv && episode) {
        watchUrl += `?ver=1&ss=${season || 1}&ep=${episode}`;
      }
      const html = await fetchText(watchUrl);

      // Tìm link .m3u8 hoặc .mp4 trực tiếp trong mã nguồn / Next.js __NEXT_DATA__
      const m3u8Regex = /https?:\/\/[^"'\s<>\]+\.m3u8[^"'\s<>\]*/g;
      const foundM3u8 = html.match(m3u8Regex) || [];
      for (const link of [...new Set(foundM3u8)]) {
        const cleanLink = link.replace(/\u002F/g, "/").replace(/\/g, "");
        streams.push({
          name: "RoPhim",
          title: `${movieItem.title}${isTv ? ` S${season || 1}E${episode || 1}` : ""} (Vietsub)`,
          url: cleanLink,
          quality: "1080p",
          headers: {
            Referer: BASE_URL + "/",
            Origin: BASE_URL,
            "User-Agent": HEADERS["User-Agent"],
          },
        });
      }

      // Tìm iframe embed player nếu không lộ link m3u8 trực tiếp
      if (streams.length === 0) {
        const iframeRegex = /<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
        let iframeMatch;
        while ((iframeMatch = iframeRegex.exec(html)) !== null) {
          const embedUrl = iframeMatch[1];
          if (embedUrl.includes("facebook") || embedUrl.includes("youtube")) continue;
          try {
            const embedHtml = await fetchText(embedUrl, {
              headers: { Referer: watchUrl },
            });
            const embedM3u8 = embedHtml.match(m3u8Regex) || [];
            for (const link of [...new Set(embedM3u8)]) {
              streams.push({
                name: "RoPhim",
                title: `${movieItem.title} - Server Dự Phòng`,
                url: link.replace(/\/g, ""),
                quality: "1080p",
                headers: {
                  Referer: embedUrl,
                  "User-Agent": HEADERS["User-Agent"],
                },
              });
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      console.error("[RoPhim] Watch page parse error:", e.message);
    }
  }

  return streams;
}

/**
 * Entry point chuẩn của Nuvio Local Scraper (.js)
 * @param {string} tmdbId - ID phim trên TMDB
 * @param {string} mediaType - "movie" hoặc "tv"
 * @param {number} season - Số mùa (nếu là phim bộ)
 * @param {number} episode - Số tập (nếu là phim bộ)
 */
async function getStreams(tmdbId, mediaType = "movie", season = 1, episode = 1) {
  try {
    const info = await getTmdbInfo(tmdbId, mediaType);
    const searchQueries = [info.titleVi, info.titleEn, info.originalTitle].filter(Boolean);

    let bestMatch = null;
    let bestScore = 0;

    for (const q of searchQueries) {
      const candidates = await searchRoPhim(q);
      for (const item of candidates) {
        const score = Math.max(
          titleSimilarity(q, item.title),
          titleSimilarity(q, item.originalTitle)
        );
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }
      if (bestScore >= 0.85) break;
    }

    if (!bestMatch || bestScore < 0.45) {
      console.log("[RoPhim] Không tìm thấy phim khớp:", searchQueries);
      return [];
    }

    return await extractStreamsFromPage(bestMatch, mediaType, season, episode);
  } catch (err) {
    console.error("[RoPhim] getStreams error:", err);
    return [];
  }
}

// Export tương thích cả CommonJS và Global Nuvio Runtime
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
}
