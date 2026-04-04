import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  FirebaseStorage,
} from "firebase/storage";
import { app } from "./index";
import { isFirebaseAvailable } from "./auth";

let _storage: FirebaseStorage | null = null;

function getStore(): FirebaseStorage {
  if (_storage) return _storage;
  if (!isFirebaseAvailable()) throw new Error("Firebase not configured");
  try {
    _storage = getStorage(app);
  } catch (e) {
    throw new Error(`Firebase Storage init failed: ${e}`);
  }
  return _storage;
}

export type UploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
};

export async function uploadFile(
  path: string,
  uri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(getStore(), path);
  const task = uploadBytesResumable(storageRef, blob);

  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
            percent: Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
            ),
          });
        }
      },
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      },
    );
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

export async function deleteFile(path: string): Promise<void> {
  const fileRef = ref(getStore(), path);
  await deleteObject(fileRef);
}
