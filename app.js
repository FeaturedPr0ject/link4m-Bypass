const $ = (id) => document.getElementById(id);
const form = $("analyze-form");
const input = $("url-input");
const clearBtn = $("clear-btn");
const submitBtn = $("submit-btn");
const errorBox = $("form-error");
const results = $("results");
const openVerification = $("open-verification");
let latestDestination = "";

$("year").textContent = new Date().getFullYear();

function setError(message) {
  errorBox.textContent = message || "";
  errorBox.hidden = !message;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function renderChain(chain) {
  const list = $("chain-list");
  list.replaceChildren();
  for (const [index, hop] of (chain || []).entries()) {
    const li = document.createElement("li");
    const number = document.createElement("span");
    number.className = "step-num";
    number.textContent = String(index + 1);
    const content = document.createElement("div");
    content.className = "step-content";
    const link = document.createElement("a");
    link.className = "step-url";
    link.textContent = hop.url;
    const safeUrl = safeHttpUrl(hop.url);
    if (safeUrl) {
      link.href = safeUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    const meta = document.createElement("div");
    meta.className = "step-meta";
    const status = hop.status ? "HTTP " + hop.status + (hop.statusText ? " · " + hop.statusText : "") : "Chưa có mã HTTP";
    meta.textContent = status + (hop.note ? " · " + hop.note : "");
    content.append(link, meta);
    li.append(number, content);
    list.append(li);
  }
}

function renderResult(data) {
  const chain = Array.isArray(data.chain) ? data.chain : [];
  latestDestination = safeHttpUrl(data.finalUrl || "");
  $("hop-count").textContent = String(chain.length);
  $("status-value").textContent = data.statusLabel || "Chưa rõ";
  $("status-note").textContent = data.statusNote || "Không có ghi chú";
  $("chain-badge").textContent = data.statusLabel || "KẾT QUẢ";
  const destinationStates = {
    "page-content": "Tìm thấy trong nội dung trang",
    "link4m-api": "Tìm thấy trong phản hồi API Link4M",
    "browser": "Tìm thấy bằng trình duyệt Chromium",
    "http-redirect": "URL cuối sau chuyển hướng HTTP",
    "unresolved": "Chưa tìm thấy URL đích"
  };
  $("destination-state").textContent = latestDestination
    ? (destinationStates[data.destinationSource] || "Đã tìm thấy URL đích")
    : (destinationStates[data.destinationSource] || "Không xác định được URL đích");
  const destinationLink = $("destination-link");
  destinationLink.textContent = latestDestination || "Không xác định được URL đích";
  destinationLink.href = latestDestination || "#";
  destinationLink.hidden = !latestDestination;
  $("destination-warning").textContent = data.warning || "Hãy kiểm tra tên miền trước khi mở liên kết.";
  const verificationUrl = safeHttpUrl(data.verificationUrl || "");
  openVerification.hidden = !(data.manualVerificationRequired && verificationUrl && !latestDestination);
  openVerification.dataset.url = verificationUrl;
  $("open-destination").disabled = !latestDestination;
  $("copy-destination").disabled = !latestDestination;
  $("copy-chain").disabled = !latestDestination;
  renderChain(chain);
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

input.addEventListener("input", () => {
  clearBtn.hidden = !input.value;
  setError("");
});

clearBtn.addEventListener("click", () => {
  input.value = "";
  clearBtn.hidden = true;
  input.focus();
  setError("");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");
  const url = input.value.trim();
  if (!safeHttpUrl(url)) {
    setError("Vui lòng nhập một URL bắt đầu bằng http:// hoặc https://.");
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = "Đang phân tích…";
  results.hidden = true;
  try {
    const response = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không thể phân tích liên kết.");
    renderResult(data);
  } catch (error) {
    setError(error.message || "Đã xảy ra lỗi. Vui lòng thử lại.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Phân tích link <span>↗</span>';
  }
});

async function copyText(value) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    $("copy-chain").textContent = "Đã sao chép!";
    $("copy-destination").textContent = "Đã sao chép!";
    setTimeout(() => {
      $("copy-chain").textContent = "Sao chép URL đích";
      $("copy-destination").textContent = "Sao chép";
    }, 1600);
  } catch {
    setError("Không thể truy cập clipboard. Hãy sao chép URL thủ công.");
  }
}

$("copy-chain").addEventListener("click", () => copyText(latestDestination));
$("copy-destination").addEventListener("click", () => copyText(latestDestination));
$("open-destination").addEventListener("click", () => {
  if (latestDestination) window.open(latestDestination, "_blank", "noopener,noreferrer");
});

openVerification.addEventListener("click", () => {
  const url = safeHttpUrl(openVerification.dataset.url || "");
  if (url) window.open(url, "_blank", "noopener,noreferrer");
});