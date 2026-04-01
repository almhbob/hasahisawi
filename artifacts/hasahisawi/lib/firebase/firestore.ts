import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  DocumentData,
  QueryConstraint,
  Firestore,
} from "firebase/firestore";
import { app, isFirebaseConfigured } from "./index";
import { isFirebaseAvailable } from "./auth";

let _db: Firestore | null = null;

function getDB(): Firestore {
  if (_db) return _db;
  if (!isFirebaseAvailable()) throw new Error("Firebase not configured");
  try {
    _db = getFirestore(app);
  } catch (e) {
    throw new Error(`Firestore init failed: ${e}`);
  }
  return _db;
}

export const COLLECTIONS = {
  USERS:        "users",
  POSTS:        "posts",
  REPORTS:      "reports",
  APPOINTMENTS: "appointments",
  JOBS:         "jobs",
  EVENTS:       "events",
  ANNOUNCEMENTS:"announcements",
  MISSING:      "missing_persons",
  NOTIFICATIONS:"notifications",
  ANALYTICS:    "analytics",
  CHATS:        "chats",
} as const;

export async function fsGetDoc<T = DocumentData>(
  col: string,
  id: string,
): Promise<(T & { id: string }) | null> {
  const snap = await getDoc(doc(getDB(), col, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as T) };
}

export async function fsGetCollection<T = DocumentData>(
  col: string,
  ...constraints: QueryConstraint[]
): Promise<(T & { id: string })[]> {
  const q = constraints.length
    ? query(collection(getDB(), col), ...constraints)
    : collection(getDB(), col);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}

export async function fsSetDoc(
  col: string,
  id: string,
  data: DocumentData,
  merge = true,
) {
  await setDoc(doc(getDB(), col, id), { ...data, updatedAt: serverTimestamp() }, { merge });
}

export async function fsAddDoc(col: string, data: DocumentData) {
  const ref = await addDoc(collection(getDB(), col), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function fsUpdateDoc(
  col: string,
  id: string,
  data: Partial<DocumentData>,
) {
  await updateDoc(doc(getDB(), col, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function fsDeleteDoc(col: string, id: string) {
  await deleteDoc(doc(getDB(), col, id));
}

export function fsListen<T = DocumentData>(
  col: string,
  cb: (items: (T & { id: string })[]) => void,
  ...constraints: QueryConstraint[]
) {
  if (!isFirebaseAvailable()) return () => {};
  try {
    const q = constraints.length
      ? query(collection(getDB(), col), ...constraints)
      : collection(getDB(), col);
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))),
      (err) => { console.warn("[Firestore] snapshot error:", err.message); },
    );
  } catch (e) {
    console.warn("[Firestore] fsListen failed:", e);
    return () => {};
  }
}

export function fsListenDoc<T = DocumentData>(
  col: string,
  id: string,
  cb: (data: (T & { id: string }) | null) => void,
) {
  if (!isFirebaseAvailable()) return () => {};
  try {
    return onSnapshot(
      doc(getDB(), col, id),
      (snap) => cb(snap.exists() ? { id: snap.id, ...(snap.data() as T) } : null),
      (err) => { console.warn("[Firestore] doc snapshot error:", err.message); },
    );
  } catch (e) {
    console.warn("[Firestore] fsListenDoc failed:", e);
    return () => {};
  }
}

export { where, orderBy, limit, serverTimestamp, Timestamp };
