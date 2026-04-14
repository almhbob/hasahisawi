import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { app, isFirebaseConfigured } from "./index";
import { isFirebaseAvailable } from "./auth";
import { getApiUrl } from "@/lib/query-client";

export type UploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
};

function getFirebaseStorage() {
  if (!isFirebaseAvailable()) throw new Error("Firebase Storage غير متاح");
  return getStorage(app);
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
    const task = uploadBytesResumable(storageRef, blob);

    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snap.bytesTransferred,
            totalBytes: snap.totalBytes,
            percent: Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
          });
        }
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

async function uploadToBackend(
  _path: string,
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
      name: `upload_${Date.now()}.jpg`,
      type: "image/jpeg",
    } as any);

    xhr.send(formData);
  });
}

export async function uploadFile(
  path: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
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
      return;
    } catch {}
  }
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

export async function uploadMissingPersonImage(
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadFile(`missing-persons/${name}`, uri, onProgress);
}
