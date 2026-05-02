import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { app, isFirebaseConfigured } from "./index";
import { isFirebaseAvailable } from "./auth";
import { getApiUrl } from "@/lib/query-client";

export type UploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
};

const CLOUDINARY_CLOUD_NAME = "dfyzdxupp";
const CLOUDINARY_UPLOAD_PRESET = "hasahisawi_upload";

function getFirebaseStorage() {
  if (!isFirebaseAvailable()) throw new Error("Firebase Storage غير متاح");
  return getStorage(app);
}

function getFileInfo(uri: string, fallback: "image" | "video") {
  const clean = uri.split("?")[0].toLowerCase();
  const isVideo = fallback === "video" || clean.endsWith(".mp4") || clean.endsWith(".mov") || clean.endsWith(".m4v") || clean.endsWith(".3gp");
  const extension = isVideo ? "mp4" : clean.endsWith(".png") ? "png" : clean.endsWith(".webp") ? "webp" : "jpg";
  const mimeType = isVideo ? "video/mp4" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  return { extension, mimeType, resourceType: isVideo ? "video" : "image" };
}

function normalizeUploadError(error: any) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  if (code.includes("unauthorized") || message.includes("permission") || message.includes("unauthorized")) {
    return new Error("تعذر الرفع بسبب الصلاحيات. تأكد أن Cloudinary Upload Preset باسم hasahisawi_upload مضبوط على Unsigned.");
  }
  if (message.includes("upload preset") || message.includes("unsigned") || message.includes("preset")) {
    return new Error("Cloudinary غير مكتمل: استخدم preset باسم hasahisawi_upload واجعله Unsigned وفعّل صيغ الصور والفيديو.");
  }
  if (message.includes("file size") || message.includes("too large") || message.includes("maximum")) {
    return new Error("حجم الملف كبير. جرّب صورة أصغر أو فيديو أقصر.");
  }
  if (message.includes("folder") || message.includes("tags")) {
    return new Error("Cloudinary رفض إعدادات إضافية للرفع. التطبيق يرفع الآن عبر preset فقط.");
  }
  if (message.includes("network") || message.includes("timeout") || message.includes("connection")) {
    return new Error("فشل الاتصال أثناء الرفع. تأكد من الإنترنت ثم حاول مرة أخرى.");
  }
  return error instanceof Error ? error : new Error("تعذر رفع الملف. حاول مرة أخرى.");
}

function optimizeCloudinaryUrl(url: string, resourceType: "image" | "video") {
  if (resourceType !== "image" || !url.includes("/upload/")) return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto:good/");
}

async function uriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

async function uploadToFirebase(
  path: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const storage = getFirebaseStorage();
  const storageRef = ref(storage, path);
  const blob = await uriToBlob(uri);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, {
      contentType: blob.type || getFileInfo(uri, path.includes("video") ? "video" : "image").mimeType,
      cacheControl: "public,max-age=31536000,immutable",
      customMetadata: { quality: "high", source: "hasahisawi" },
    });

    task.on(
      "state_changed",
      (snap) => {
        onProgress?.({
          bytesTransferred: snap.bytesTransferred,
          totalBytes: snap.totalBytes,
          percent: Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
        });
      },
      (err) => reject(normalizeUploadError(err)),
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (e) {
          reject(normalizeUploadError(e));
        }
      },
    );
  });
}

async function uploadToCloudinary(
  path: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const info = getFileInfo(uri, path.includes("video") ? "video" : "image");
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${info.resourceType}/upload`;

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
      try {
        const json = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) {
          resolve(optimizeCloudinaryUrl(json.secure_url as string, info.resourceType as "image" | "video"));
        } else {
          reject(normalizeUploadError(new Error(json.error?.message || `Cloudinary upload failed: ${xhr.status}`)));
        }
      } catch (error) {
        reject(normalizeUploadError(error));
      }
    };

    xhr.onerror = () => reject(new Error("تعذّر الاتصال بـ Cloudinary أثناء رفع الملف"));
    xhr.ontimeout = () => reject(new Error("انتهت مهلة رفع الملف"));
    xhr.timeout = 180_000;
    xhr.open("POST", endpoint);

    const formData = new FormData();
    formData.append("file", {
      uri,
      name: `hasahisawi_${Date.now()}.${info.extension}`,
      type: info.mimeType,
    } as any);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    xhr.send(formData);
  });
}

async function uploadToBackend(
  _path: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const info = getFileInfo(uri, _path.includes("video") ? "video" : "image");

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
        reject(new Error(`فشل الرفع: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("تعذّر الاتصال بالخادم أثناء الرفع"));
    xhr.ontimeout = () => reject(new Error("انتهت مهلة الرفع"));
    xhr.timeout = 120_000;
    xhr.open("POST", `${getApiUrl()}/api/upload`);

    const formData = new FormData();
    formData.append("file", {
      uri,
      name: `upload_${Date.now()}.${info.extension}`,
      type: info.mimeType,
    } as any);

    xhr.send(formData);
  });
}

export async function uploadFile(
  path: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  try {
    return await uploadToCloudinary(path, uri, onProgress);
  } catch (cloudinaryError) {
    console.warn("[Cloudinary] الرفع فشل، تجربة Firebase ثم Backend:", cloudinaryError);
  }

  if (isFirebaseConfigured && isFirebaseAvailable()) {
    try {
      return await uploadToFirebase(path, uri, onProgress);
    } catch (err) {
      console.warn("[Firebase Storage] رفع Firebase فشل، التحويل للـ Backend:", err);
    }
  }

  return uploadToBackend(path, uri, onProgress);
}

export async function deleteFile(path: string): Promise<void> {
  if (isFirebaseConfigured && isFirebaseAvailable()) {
    try {
      const storage = getFirebaseStorage();
      await deleteObject(ref(storage, path));
    } catch {}
  }
}

export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  return uploadFile(`avatars/${userId}/profile.jpg`, uri);
}

export async function uploadPostImage(userId: string, uri: string, onProgress?: (p: UploadProgress) => void): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`posts/${userId}/${name}`, uri, onProgress);
}

export async function uploadPostVideo(userId: string, uri: string, onProgress?: (p: UploadProgress) => void): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
  return uploadFile(`posts_videos/${userId}/${name}`, uri, onProgress);
}

export async function uploadReportImage(reportId: string, uri: string, onProgress?: (p: UploadProgress) => void): Promise<string> {
  const name = `${Date.now()}.jpg`;
  return uploadFile(`reports/${reportId}/${name}`, uri, onProgress);
}

export async function uploadAdImage(uri: string, onProgress?: (p: UploadProgress) => void): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`ads/${name}`, uri, onProgress);
}

export async function uploadLandmarkImage(uri: string, onProgress?: (p: UploadProgress) => void): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`landmarks/${name}`, uri, onProgress);
}

export async function uploadHonorImage(uri: string, onProgress?: (p: UploadProgress) => void): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`honored-figures/${name}`, uri, onProgress);
}

export async function uploadPaymentProof(userId: string, uri: string, onProgress?: (p: UploadProgress) => void): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`payment-proofs/${userId}/${name}`, uri, onProgress);
}

export async function uploadMissingPersonImage(uri: string, onProgress?: (p: UploadProgress) => void): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`missing-persons/${name}`, uri, onProgress);
}
