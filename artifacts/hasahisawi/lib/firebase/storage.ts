import { getApiUrl } from "@/lib/query-client";

export type UploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
};

/**
 * رفع ملف إلى API Server عبر XMLHttpRequest مع تقارير التقدم.
 * يعمل بشكل موثوق على Android وiOS دون الحاجة لـ Firebase Auth.
 */
export function uploadFile(
  _path: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // تقارير تقدم الرفع
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
    xhr.timeout = 120_000; // دقيقتان

    xhr.open("POST", `${getApiUrl()}/api/upload`);

    // بناء FormData مع الملف
    const formData = new FormData();
    formData.append("file", {
      uri,
      name: `upload_${Date.now()}.jpg`,
      type: "image/jpeg",
    } as any);

    xhr.send(formData);
  });
}

export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  return uploadFile(`avatars/${userId}/profile.jpg`, uri);
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
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
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

export async function deleteFile(_path: string): Promise<void> {
  // الحذف غير مطلوب في هذه المرحلة
}
