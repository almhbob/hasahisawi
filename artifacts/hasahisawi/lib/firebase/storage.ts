import { getApiUrl } from "@/lib/query-client";

export type UploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  webm: "video/webm",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  avi: "video/x-msvideo",
};

function inferFileMeta(uri: string, fallbackPath?: string): { name: string; type: string; ext: string } {
  const cleaned = uri.split("?")[0].split("#")[0];
  const last = cleaned.substring(cleaned.lastIndexOf("/") + 1);
  let ext = (last.includes(".") ? last.substring(last.lastIndexOf(".") + 1) : "").toLowerCase();
  if (!ext && fallbackPath) {
    const m = fallbackPath.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (m) ext = m[1];
  }
  if (!ext) ext = "jpg";
  const type = MIME_BY_EXT[ext] || (ext.match(/^(mp4|mov|mkv|webm|3gp|avi|m4v)$/) ? "video/mp4" : "image/jpeg");
  const name = `upload_${Date.now()}.${ext}`;
  return { name, type, ext };
}

async function uploadToBackend(
  filePath: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress({
          bytesTransferred: e.loaded,
          totalBytes: e.total,
          percent: Math.round((e.loaded / e.total) * 100),
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve(json.url as string);
        } catch {
          reject(new Error("استجابة غير صالحة من الخادم"));
        }
      } else {
        let msg = `فشل الرفع (${xhr.status})`;
        try {
          const j = JSON.parse(xhr.responseText);
          if (j?.error) msg = j.error;
        } catch {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("تعذّر الاتصال بالخادم أثناء الرفع"));
    xhr.ontimeout = () => reject(new Error("انتهت مهلة الرفع"));
    // 15 دقيقة لدعم الفيديوهات الكبيرة على الشبكات البطيئة
    xhr.timeout = 15 * 60 * 1000;

    xhr.open("POST", `${getApiUrl()}/api/upload`);

    const meta = inferFileMeta(uri, filePath);
    const formData = new FormData();
    formData.append("file", {
      uri,
      name: meta.name,
      type: meta.type,
    } as any);

    xhr.send(formData);
  });
}

export async function uploadFile(
  path: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  return uploadToBackend(path, uri, onProgress);
}

export async function deleteFile(_path: string): Promise<void> {
  // الحذف يتم عبر DELETE /api/upload مع public_id من Cloudinary
}

export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  const { ext } = inferFileMeta(uri);
  const safeExt = ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext) ? ext : "jpg";
  return uploadFile(`avatars/${userId}/profile.${safeExt}`, uri);
}

export async function uploadPostImage(
  userId: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`posts/${userId}/${name}`, uri, onProgress);
}

export async function uploadPostVideo(
  userId: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const meta = inferFileMeta(uri);
  const ext = meta.ext === "jpg" ? "mp4" : meta.ext;
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  return uploadFile(`posts_videos/${userId}/${name}`, uri, onProgress);
}

export async function uploadReportImage(
  reportId: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const name = `${Date.now()}.jpg`;
  return uploadFile(`reports/${reportId}/${name}`, uri, onProgress);
}

export async function uploadAdImage(
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`ads/${name}`, uri, onProgress);
}

export async function uploadLandmarkImage(
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`landmarks/${name}`, uri, onProgress);
}

export async function uploadHonorImage(
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`honored-figures/${name}`, uri, onProgress);
}

export async function uploadPaymentProof(
  userId: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`payment-proofs/${userId}/${name}`, uri, onProgress);
}

export async function uploadMissingPersonImage(
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`missing-persons/${name}`, uri, onProgress);
}
