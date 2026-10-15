import dns from "node:dns/promises";
import net from "node:net";

const MAX_HOPS = 8;
const TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 700000;
const ALLOWED_START_DOMAINS = ["link4m.com", "link4m.net", "link4m.org", "link4m.app"];

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.send(JSON.stringify(body));
}

function isAllowedStart(host) {
  const value = host.toLowerCase().replace(/\.$/, "");
  return ALLOWED_START_DOMAINS.some((domain) => value === domain || value.endsWith("." + domain));
}

function ipv4ToNumbers(ip) {
  return ip.split(".").map(Number);
}

function isPrivateIPv4(ip) {
  const [a, b] = ipv4ToNumbers(ip);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) || (a === 203 && b === 0);
}

function isPrivateIPv6(ip) {
  const s = ip.toLowerCase().split("%")[0];
  return s === "::" || s === "::1" || s.startsWith("fc") || s.startsWith("fd") ||
    /^fe[89ab]/.test(s) || s.startsWith("ff") || s.startsWith("2001:db8:");
}

async function validatePublicHttpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("URL không hợp lệ."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Chỉ hỗ trợ URL HTTP hoặc HTTPS.");
  if (url.username || url.password) throw new Error("Không hỗ trợ URL có thông tin đăng nhập nhúng.");
  if (!url.hostname || url.hostname.length > 253) throw new Error("Tên miền không hợp lệ.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("Từ chối địa chỉ mạng nội bộ.");
  const ipType = net.isIP(host);
  if (ipType === 4 && isPrivateIPv4(host)) throw new Error("Từ chối địa chỉ IP riêng hoặc nội bộ.");
  if (ipType === 6 && isPrivateIPv6(host)) throw new Error("Từ chối địa chỉ IPv6 riêng hoặc nội bộ.");
  if (!ipType) {
    let records;
    try { records = await dns.lookup(host, { all: true, verbatim: true }); }
    catch { throw new Error("Không phân giải được tên miền."); }
    if (!records.length || records.some((record) => record.family === 4 ? isPrivateIPv4(record.address) : isPrivateIPv6(record.address))) {
      throw new Error("Tên miền phân giải tới địa chỉ mạng nội bộ hoặc không công khai.");
    }
  }
  return url;
}

function findMediaFireUrl(html, baseUrl) {
  const patterns = [
    /https?:\\?\/\\?\/(?:www\.)?mediafire\.com\/[^\s"'<>\\]+/gi,
    /https?:\/\/(?:www\.)?mediafire\.com\/[^\s"'<>]+/gi
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[0].replace(/\\\//g, "/").replace(/\\u0026/g, "&").replace(/[),;]+$/, "");
      try {
        const url = new URL(raw, baseUrl);
        if (url.hostname === "mediafire.com" || url.hostname.endsWith(".mediafire.com")) return url.href;
      } catch {}
    }
  }
  return "";
}


function normalizeEncodedText(value) {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/\\u002f/gi, "/")
    .replace(/\\u003a/gi, ":")
    .replace(/\\u0026/gi, "&")
    .replace(/\\x2f/gi, "/")
    .replace(/\\x3a/gi, ":")
    .replace(/\\\//g, "/")
    .replace(/%3a/gi, ":")
    .replace(/%2f/gi, "/")
    .replace(/%2e/gi, ".")
    .replace(/\\u0025/gi, "%");
}

function findMediaFireUrlDeep(value, baseUrl) {
  const queue = [typeof value === "string" ? value : JSON.stringify(value ?? "")];
  const seen = new Set();
  let decodedCount = 0;

  while (queue.length && seen.size < 60) {
    const candidate = queue.shift();
    if (typeof candidate !== "string" || !candidate || seen.has(candidate)) continue;
    seen.add(candidate);

    const normalized = normalizeEncodedText(candidate);
    const direct = findMediaFireUrl(normalized, baseUrl);
    if (direct) return direct;

    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded !== candidate && !seen.has(decoded)) queue.push(decoded);
    } catch {}

    try {
      const parsed = JSON.parse(normalized);
      if (typeof parsed === "string" && parsed !== candidate) queue.push(parsed);
      else if (parsed && typeof parsed === "object" && decodedCount < 8) {
        decodedCount++;
        queue.push(JSON.stringify(parsed));
      }
    } catch {}

    if (decodedCount < 18) {
      const tokens = normalized.match(/[A-Za-z0-9_+/-]{28,4096}={0,2}/g) || [];
      for (const token of tokens.slice(0, 18)) {
        try {
          const decoded = Buffer.from(token.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
          if (decoded && /[a-z]{3,}:|mediafire|https?/i.test(decoded) && decoded !== token) {
            queue.push(decoded);
            decodedCount++;
            if (decodedCount >= 18) break;
          }
        } catch {}
      }
    }
  }

  return "";
}

function extractFirstPartyScripts(html, baseUrl) {
  const scripts = [];
  const pattern = /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(normalizeEncodedText(match[2]), baseUrl);
      const host = url.hostname.toLowerCase();
      const allowed = isAllowedStart(host) || host === "s1.link4m.app" || host.endsWith(".link4m.app");
      if (allowed && url.protocol === "https:" && !scripts.includes(url.href)) scripts.push(url.href);
    } catch {}
  }
  scripts.sort((a, b) => Number(/\/Links\/view\.js/i.test(b)) - Number(/\/Links\/view\.js/i.test(a)));
  return scripts.slice(0, 3);
}

async function fetchSmallResource(value, maxBytes = 180000) {
  let url;
  try {
    url = await validatePublicHttpUrl(value);
  } catch {
    return "";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(url.href, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Link4M-Inspector/2.0)",
        "Accept": "text/javascript,application/javascript,text/plain,*/*;q=0.5",
        "Referer": url.origin + "/"
      }
    });
    if (response.status !== 200) return "";
    const type = response.headers.get("content-type") || "";
    if (!/(javascript|ecmascript|text\/plain|text\/html|json)/i.test(type)) return "";
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks = [];
    let total = 0;
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value.slice(0, maxBytes - total);
      chunks.push(Buffer.from(part));
      total += part.length;
      if (part.length < value.length) break;
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function queryLink4mAdvertise(alias, codes) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch("https://s1.link4m.app/api/campaign/get-advertise", {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": "https://link4m.net",
        "Referer": "https://link4m.net/"
      },
      body: new URLSearchParams({ alias, codes })
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, reason: "API Link4M trả về HTTP " + response.status };
    try { return { ok: true, data: JSON.parse(text) }; }
    catch { return { ok: false, reason: "API Link4M không trả về JSON hợp lệ" }; }
  } catch (error) {
    return { ok: false, reason: error.name === "AbortError" ? "API Link4M hết thời gian chờ" : "Không thể truy vấn API Link4M" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": "Link4M-Inspector/1.1 (+HTTP redirect analysis)",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Chỉ hỗ trợ phương thức POST." });
  }

  let input;
  try { input = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return json(res, 400, { error: "Dữ liệu gửi lên không hợp lệ." }); }
  if (!input || typeof input.url !== "string" || input.url.length > 2048) {
    return json(res, 400, { error: "Vui lòng nhập URL có độ dài hợp lệ." });
  }

  let current;
  try {
    current = await validatePublicHttpUrl(input.url.trim());
    if (!isAllowedStart(current.hostname)) {
      return json(res, 400, { error: "Chỉ nhận link từ link4m.com, link4m.net, link4m.org hoặc link4m.app." });
    }
  } catch (error) {
    return json(res, 400, { error: error.message || "URL không hợp lệ." });
  }

  const chain = [];
  let statusLabel = "Hoàn tất";
  let statusNote = "Đã kiểm tra chuỗi HTTP";
  let warning = "Hãy kiểm tra tên miền trước khi mở liên kết.";
  let finalUrl = current.href;
  let destinationSource = "http-redirect";

  for (let i = 0; i < MAX_HOPS; i++) {
    try {
      await validatePublicHttpUrl(current.href);
      const response = await fetchWithTimeout(current.href);
      const item = { url: current.href, status: response.status, statusText: response.statusText, note: "Phản hồi HTTP" };
      chain.push(item);
      const location = response.headers.get("location");

      if (response.status >= 300 && response.status < 400 && location) {
        if (i === MAX_HOPS - 1) {
          item.note = "Đã đạt giới hạn số bước";
          statusLabel = "Vượt giới hạn";
          statusNote = "Đã dừng sau " + MAX_HOPS + " URL";
          warning = "Chuỗi chuyển hướng dài hơn giới hạn an toàn.";
          break;
        }
        let next;
        try {
          next = new URL(location, current);
          await validatePublicHttpUrl(next.href);
        } catch (error) {
          item.note = "Redirect bị chặn vì lý do an toàn";
          statusLabel = "Đã chặn";
          statusNote = error.message || "URL chuyển hướng không an toàn";
          warning = "Đã dừng trước khi truy cập URL không an toàn.";
          break;
        }
        item.note = "Chuyển hướng HTTP " + response.status;
        current = next;
        finalUrl = current.href;
        continue;
      }

      finalUrl = current.href;
      if ([401, 403, 429].includes(response.status)) {
        item.note = "Trang yêu cầu quyền truy cập hoặc giới hạn yêu cầu";
        statusLabel = "Cần xác minh";
        statusNote = "Máy chủ trả về HTTP " + response.status;
        warning = "Có thể cần mã xác minh, CAPTCHA hoặc chờ giới hạn truy cập. Công cụ không vượt qua các bước này.";
      } else if (response.status >= 200 && response.status < 300) {
        item.note = "Không còn redirect HTTP được quan sát";
        statusNote = "Không còn redirect HTTP được quan sát";
        warning = "Nếu trang chỉ tiết lộ đích sau khi nhập mã hoặc chạy JavaScript, công cụ không thể suy ra URL đó từ HTTP.";
        const type = response.headers.get("content-type") || "";
        if (type.includes("text/html") || type.includes("text/plain") || type.includes("javascript")) {
          let body = "";
          try {
            const reader = response.body?.getReader();
            if (reader) {
              const chunks = [];
              let total = 0;
              while (total < MAX_BODY_BYTES) {
                const { done, value } = await reader.read();
                if (done) break;
                const part = value.slice(0, MAX_BODY_BYTES - total);
                chunks.push(part);
                total += part.length;
                if (part.length < value.length) break;
              }
              body = new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
            }
          } catch {}
          let mediaFireUrl = findMediaFireUrlDeep(body, current.href);
          if (!mediaFireUrl) {
            const scripts = extractFirstPartyScripts(body, current.href);
            const scriptBodies = await Promise.all(scripts.map((scriptUrl) => fetchSmallResource(scriptUrl)));
            mediaFireUrl = findMediaFireUrlDeep(scriptBodies.join("\n"), current.href);
          }
          const isLink4MVerificationPage =
            /id=["']captcha-html-wrapper["']/i.test(body) ||
            /class=["'][^"']*captcha-page/i.test(body) ||
            /data-code\s*=/i.test(body);

          if (mediaFireUrl) {
            finalUrl = mediaFireUrl;
            destinationSource = "page-content";
            statusNote = "Tìm thấy URL MediaFire trong nội dung trang";
            warning = "URL MediaFire được tìm thấy trong nội dung phản hồi, nhưng chưa được xác minh là đích thực tế sau bước mã xác minh.";
            item.note = "Tìm thấy URL MediaFire trong nội dung trang";
          } else if (isLink4MVerificationPage) {
            const aliasMatch = body.match(/data-alias\\s*=\\s*["']([^"']+)["']/i);
            const codeMatch = body.match(/data-code\\s*=\\s*["']([^"']+)["']/i);
            let apiMessage = "Không tìm thấy đủ alias/code để truy vấn API Link4M.";
            if (aliasMatch && codeMatch) {
              const apiResult = await queryLink4mAdvertise(aliasMatch[1], codeMatch[1]);
              if (apiResult.ok && apiResult.data && apiResult.data.success) {
                const apiData = apiResult.data;
                const apiHtml = [apiData.html, apiData.form, apiData.content].filter((value) => typeof value === "string").join("\\n");
                const apiMediaFireUrl = findMediaFireUrlDeep([apiHtml, apiData], "https://s1.link4m.app/");
                const explicitDestination = [apiData.destination_url, apiData.final_url, apiData.target_url]
                  .find((value) => typeof value === "string" && value.length > 0);
                if (apiMediaFireUrl || explicitDestination) {
                  const candidate = apiMediaFireUrl || explicitDestination;
                  try {
                    const candidateUrl = await validatePublicHttpUrl(candidate);
                    if (candidateUrl.hostname === "mediafire.com" || candidateUrl.hostname.endsWith(".mediafire.com")) {
                      finalUrl = candidateUrl.href;
                      destinationSource = "link4m-api";
                      statusNote = "Tìm thấy URL MediaFire trong phản hồi API Link4M";
                      warning = "URL lấy từ phản hồi API; hãy kiểm tra tên miền trước khi mở.";
                      item.note = "Tìm thấy URL MediaFire trong API Link4M";
                    } else {
                      finalUrl = "";
                      destinationSource = "verification-required";
                      statusLabel = "Cần xác minh";
                      statusNote = "API chưa trả về URL MediaFire";
                      warning = "API trả về URL khác MediaFire; công cụ không coi đó là đích tải cuối cùng.";
                      item.note = "API chưa cung cấp URL MediaFire";
                    }
                  } catch {
                    finalUrl = "";
                    destinationSource = "verification-required";
                    statusLabel = "Cần xác minh";
                    statusNote = "URL từ API không hợp lệ hoặc không an toàn";
                    warning = "Đã bỏ qua URL không đáp ứng kiểm tra an toàn.";
                    item.note = "URL API bị từ chối bởi kiểm tra an toàn";
                  }
                } else {
                  apiMessage = "API trả về nội dung trang, nhưng chưa có URL đích công khai; có thể cần CAPTCHA hoặc biểu mẫu.";
                }
              } else {
                apiMessage = apiResult.reason || "API Link4M yêu cầu thêm bước xác minh.";
              }
            }
            if (!finalUrl || destinationSource !== "link4m-api") {
              finalUrl = "";
              destinationSource = "verification-required";
              statusLabel = "Cần xác minh";
              statusNote = "Link4M đang yêu cầu xác minh hoặc chưa tiết lộ URL đích";
              warning = apiMessage + " Công cụ không tự vượt CAPTCHA, mật khẩu hoặc câu hỏi bảo mật.";
              item.note = "Đã truy vấn API Link4M; chưa có URL đích xác thực";
            }
          }
        }
      } else {
        statusLabel = "Đã dừng";
        statusNote = "Máy chủ trả về HTTP " + response.status;
        warning = "Không có chuyển hướng HTTP tiếp theo trong phản hồi này.";
      }
      break;
    } catch (error) {
      chain.push({ url: current.href, status: null, statusText: "", note: error.name === "AbortError" ? "Hết thời gian chờ" : "Không thể kết nối" });
      statusLabel = "Không hoàn tất";
      statusNote = error.name === "AbortError" ? "Máy chủ đích phản hồi quá chậm" : "Lỗi kết nối hoặc DNS";
      warning = "Không thể xác định URL đích sau lỗi kết nối.";
      break;
    }
  }

  if (finalUrl) {
    try {
      const returnedHost = new URL(finalUrl).hostname;
      if (isAllowedStart(returnedHost) && destinationSource !== "page-content" && destinationSource !== "link4m-api") {
        finalUrl = "";
        destinationSource = "unresolved";
        if (statusLabel === "Hoàn tất") statusLabel = "Cần xác minh";
        statusNote = "Trang vẫn ở Link4M; chưa tìm thấy URL đích";
        warning = "Đã kiểm tra redirect HTTP, HTML và các script được nhúng nhưng chưa tìm thấy link đích. URL Link4M trung gian không được trả về như link tải.";
      }
    } catch {}
  }

  return json(res, 200, { chain, finalUrl, statusLabel, statusNote, warning, destinationSource });
}