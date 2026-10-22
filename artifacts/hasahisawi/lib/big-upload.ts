// رفع ملفات كبيرة (كتب حتى 300MB) مباشرةً إلى التخزين عبر رابط موقّع،
// مع شريط تقدّم، دون تحميل الملف كاملاً في ذاكرة التطبيق على الهاتف.
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

export type UploadTarget = { upload_url: string; method?: string; headers?: Record<string, string>; content_type?: string };

function parseResult(text: string): string {
  let body: any = {};
  try { body = JSON.parse(text || "{}"); } catch {}
  const url = body?.url || body?.downloadUrl;
  if (!url) throw new Error(body?.error?.message || body?.error || "لم يُرجع التخزين رابط الملف");
  return String(url).split("?")[0];
}

function friendly(status: number, text: string): Error {
  let msg = "";
  try { const b = JSON.parse(text); msg = b?.error?.message || b?.error || ""; } catch {}
  if (status === 413 || /too large|size/i.test(msg)) return new Error("حجم الملف أكبر من الحد المسموح (300 ميجابايت).");
  if (status === 403 || /expired/i.test(msg)) return new Error("انتهت صلاحية رابط الرفع — أعد المحاولة.");
  return new Error(msg || `فشل الرفع (${status})`);
}

export async function uploadToTarget(
  target: UploadTarget,
  file: { uri: string; file?: File; mimeType?: string | null; size?: number | null },
  onProgress?: (pct: number) => void,
): Promise<string> {
  const headers: Record<string, string> = { ...(target.headers || {}) };
  if (file.size) headers["x-content-length"] = String(file.size);

  if (Platform.OS === "web") {
    const body: Blob = file.file ?? (await (await fetch(file.uri)).blob());
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(target.method || "PUT", target.upload_url);
      Object.entries(headers).forEach(([k, v]) => { if (k.toLowerCase() !== "x-content-length") xhr.setRequestHeader(k, v); });
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { try { resolve(parseResult(xhr.responseText)); } catch (e) { reject(e); } }
        else reject(friendly(xhr.status, xhr.responseText));
      };
      xhr.onerror = () => reject(new Error("انقطع الاتصال أثناء الرفع — تأكد من الإنترنت وأعد المحاولة."));
      xhr.timeout = 60 * 60 * 1000;
      xhr.send(body);
    });
  }

  // Native: stream the file from disk (no full read into JS memory).
  const task = FileSystem.createUploadTask(
    target.upload_url,
    file.uri,
    { httpMethod: (target.method || "PUT") as any, uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers },
    (p) => { if (onProgress && p.totalBytesExpectedToSend > 0) onProgress(Math.round((p.totalBytesSent / p.totalBytesExpectedToSend) * 100)); },
  );
  const res = await task.uploadAsync();
  if (!res) throw new Error("أُلغي الرفع");
  if (res.status < 200 || res.status >= 300) throw friendly(res.status, res.body);
  return parseResult(res.body);
}
