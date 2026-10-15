import dns from "node:dns/promises";
import net from "node:net";

const ALLOWED_START_DOMAINS = ["link4m.com", "link4m.net", "link4m.org", "link4m.app"];
const MAX_HOPS = 8;
const TIMEOUT_MS = 7000;

function isAllowedStart(host) {
  const h = host.toLowerCase().replace(/\.$/, "");
  return ALLOWED_START_DOMAINS.some((domain) => h === domain || h.endsWith("." + domain));
}
function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a,b,c] = p;
  return a===0 || a===10 || a===127 || a>=224 ||
    (a===100 && b>=64 && b<=127) || (a===169 && b===254) ||
    (a===172 && b>=16 && b<=31) || (a===192 && (b===0 || b===168)) ||
    (a===198 && (b===18 || b===19)) || (a===192 && b===0 && c===2) ||
    (a===198 && b===51 && c===100) || (a===203 && b===0 && c===113);
}
function isPrivateIPv6(ip) {
  const s=ip.toLowerCase().split("%")[0];
  return s==="::" || s==="::1" || s.startsWith("fc") || s.startsWith("fd") ||
    /^fe[89ab]/.test(s) || s.startsWith("ff") || s.startsWith("2001:db8:");
}
async function validatePublicHttpUrl(value) {
  let url;
  try { url=new URL(value); } catch { throw new Error("URL không hợp lệ."); }
  if (!["http:","https:"].includes(url.protocol)) throw new Error("Chỉ hỗ trợ URL HTTP hoặc HTTPS.");
  if (url.username || url.password) throw new Error("Không hỗ trợ URL có thông tin đăng nhập nhúng.");
  if (!url.hostname || url.hostname.length>253) throw new Error("Tên miền không hợp lệ.");
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if (host==="localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("Từ chối địa chỉ mạng nội bộ.");
  const ipType=net.isIP(host);
  if (ipType===4 && isPrivateIPv4(host)) throw new Error("Từ chối địa chỉ IP riêng hoặc nội bộ.");
  if (ipType===6 && isPrivateIPv6(host)) throw new Error("Từ chối địa chỉ IPv6 riêng hoặc nội bộ.");
  if (!ipType) {
    let records;
    try { records=await dns.lookup(host,{all:true,verbatim:true}); } catch { throw new Error("Không phân giải được tên miền."); }
    if (!records.length || records.some(record=>record.family===4?isPrivateIPv4(record.address):isPrivateIPv6(record.address))) throw new Error("Tên miền phân giải tới địa chỉ mạng nội bộ hoặc không công khai.");
  }
  return url;
}
function json(res,status,body) {
  res.status(status).setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  return res.send(JSON.stringify(body));
}
export default async function handler(req,res) {
  if(req.method!=="POST"){res.setHeader("Allow","POST");return json(res,405,{error:"Chỉ hỗ trợ phương thức POST."})}
  let input;
  try{input=typeof req.body==="string"?JSON.parse(req.body):req.body}catch{return json(res,400,{error:"Dữ liệu gửi lên không hợp lệ."})}
  if(!input||typeof input.url!=="string"||input.url.length>2048)return json(res,400,{error:"Vui lòng nhập URL có độ dài hợp lệ."});
  let current;
  try {
    current=await validatePublicHttpUrl(input.url.trim());
    if(!isAllowedStart(current.hostname))return json(res,400,{error:"Chỉ nhận link từ link4m.com, link4m.net, link4m.org hoặc link4m.app. Hãy cập nhật danh sách nếu tên miền chính thức khác."});
  } catch(error) { return json(res,400,{error:error.message||"URL không hợp lệ."}) }
  const chain=[];
  let statusLabel="Hoàn tất",statusNote="Đã kiểm tra chuỗi HTTP",warning="Hãy kiểm tra tên miền trước khi mở liên kết.",finalUrl=current.href;
  for(let i=0;i<MAX_HOPS;i++) {
    finalUrl=current.href;
    chain.push({url:current.href,status:null,statusText:"",note:"Đang kiểm tra phản hồi"});
    let response;
    try {
      await validatePublicHttpUrl(current.href);
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
      try {
        response=await fetch(current.href,{method:"GET",redirect:"manual",signal:controller.signal,headers:{"User-Agent":"Link4M-Inspector/1.0","Accept":"text/html,application/xhtml+xml,*/*;q=0.8"}});
      } finally {clearTimeout(timeout)}
    } catch(error) {
      chain[chain.length-1].note=error.name==="AbortError"?"Hết thời gian chờ":"Không thể kết nối";
      statusLabel="Không hoàn tất";statusNote=error.name==="AbortError"?"Máy chủ đích phản hồi quá chậm":"Lỗi kết nối hoặc DNS";warning="Không thể xác định URL đích sau lỗi kết nối.";break;
    }
    const item=chain[chain.length-1];item.status=response.status;item.statusText=response.statusText;item.note="Phản hồi HTTP";
    const location=response.headers.get("location");
    if(response.status>=300&&response.status<400&&location) {
      if(i===MAX_HOPS-1){item.note="Đã đạt giới hạn số bước";statusLabel="Vượt giới hạn";statusNote="Đã dừng sau "+MAX_HOPS+" URL";warning="Chuỗi redirect dài hơn giới hạn an toàn của công cụ.";break}
      let next;
      try {next=new URL(location,current);await validatePublicHttpUrl(next.href)}
      catch(error){item.note="Redirect bị chặn vì lý do an toàn";statusLabel="Đã chặn";statusNote=error.message||"URL chuyển hướng không an toàn";warning="Công cụ đã dừng trước khi truy cập URL không an toàn.";break}
      item.note="Chuyển hướng HTTP "+response.status;current=next;finalUrl=current.href;continue;
    }
    if(response.status===401||response.status===403||response.status===429){item.note="Trang yêu cầu quyền truy cập hoặc giới hạn yêu cầu";statusLabel="Cần xác minh";statusNote="Máy chủ trả về HTTP "+response.status;warning="Có thể cần CAPTCHA, đăng nhập hoặc chờ giới hạn truy cập. Công cụ không vượt qua các bước này."}
    else if(response.status>=200&&response.status<300){item.note="Đã nhận phản hồi cuối";statusLabel="Hoàn tất";statusNote="Không còn redirect HTTP được quan sát";warning="Nếu trang chuyển hướng bằng JavaScript hoặc meta refresh, URL đích có thể chưa được phát hiện."}
    else{item.note="Phản hồi cuối, không có redirect";statusLabel="Đã dừng";statusNote="Máy chủ trả về HTTP "+response.status;warning="Không có chuyển hướng HTTP tiếp theo trong phản hồi này."}
    break;
  }
  return json(res,200,{chain,finalUrl,statusLabel,statusNote,warning});
}