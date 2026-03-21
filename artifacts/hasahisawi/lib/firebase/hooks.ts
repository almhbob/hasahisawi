import { useState, useEffect, useCallback } from "react";
import {
  fsGetCollection,
  fsAddDoc,
  fsUpdateDoc,
  fsDeleteDoc,
  fsListen,
  fsListenDoc,
  COLLECTIONS,
  where,
  orderBy,
  limit,
} from "./firestore";
import { isFirebaseConfigured } from "./index";

export type FsPost = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  imageUrl?: string;
  category: string;
  likes: number;
  comments: number;
  createdAt: unknown;
};

export type FsAnnouncement = {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  createdAt: unknown;
};

export type FsJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  type: "full" | "part" | "remote" | "volunteer";
  description: string;
  contactPhone?: string;
  contactEmail?: string;
  salary?: string;
  postedBy: string;
  active: boolean;
  createdAt: unknown;
};

export type FsMissing = {
  id: string;
  name: string;
  age?: number;
  description: string;
  lastSeenLocation: string;
  imageUrl?: string;
  contactPhone: string;
  status: "missing" | "found";
  postedBy: string;
  createdAt: unknown;
};

export function useFsPosts(category?: string) {
  const [posts, setPosts] = useState<FsPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) { setLoading(false); return; }
    const constraints = [
      orderBy("createdAt", "desc"),
      limit(50),
      ...(category ? [where("category", "==", category)] : []),
    ];
    const unsub = fsListen<FsPost>(COLLECTIONS.POSTS, (items) => {
      setPosts(items);
      setLoading(false);
    }, ...constraints);
    return unsub;
  }, [category]);

  const addPost = useCallback(async (data: Omit<FsPost, "id" | "createdAt">) => {
    return fsAddDoc(COLLECTIONS.POSTS, { ...data, likes: 0, comments: 0 });
  }, []);

  const deletePost = useCallback(async (id: string) => {
    return fsDeleteDoc(COLLECTIONS.POSTS, id);
  }, []);

  return { posts, loading, addPost, deletePost };
}

export function useFsAnnouncements() {
  const [items, setItems] = useState<FsAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) { setLoading(false); return; }
    const unsub = fsListen<FsAnnouncement>(
      COLLECTIONS.ANNOUNCEMENTS,
      (data) => { setItems(data); setLoading(false); },
      orderBy("pinned", "desc"),
      orderBy("createdAt", "desc"),
    );
    return unsub;
  }, []);

  return { announcements: items, loading };
}

export function useFsJobs() {
  const [jobs, setJobs] = useState<FsJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) { setLoading(false); return; }
    const unsub = fsListen<FsJob>(
      COLLECTIONS.JOBS,
      (data) => { setJobs(data); setLoading(false); },
      where("active", "==", true),
      orderBy("createdAt", "desc"),
    );
    return unsub;
  }, []);

  const addJob = useCallback(async (data: Omit<FsJob, "id" | "createdAt">) => {
    return fsAddDoc(COLLECTIONS.JOBS, { ...data, active: true });
  }, []);

  return { jobs, loading, addJob };
}

export function useFsMissing() {
  const [items, setItems] = useState<FsMissing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) { setLoading(false); return; }
    const unsub = fsListen<FsMissing>(
      COLLECTIONS.MISSING,
      (data) => { setItems(data); setLoading(false); },
      where("status", "==", "missing"),
      orderBy("createdAt", "desc"),
    );
    return unsub;
  }, []);

  const addMissing = useCallback(async (data: Omit<FsMissing, "id" | "createdAt">) => {
    return fsAddDoc(COLLECTIONS.MISSING, { ...data, status: "missing" });
  }, []);

  const markFound = useCallback(async (id: string) => {
    return fsUpdateDoc(COLLECTIONS.MISSING, id, { status: "found" });
  }, []);

  return { missing: items, loading, addMissing, markFound };
}

export function useFsDoc<T>(col: string, id: string | null) {
  const [data, setData] = useState<(T & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !isFirebaseConfigured) { setLoading(false); return; }
    const unsub = fsListenDoc<T>(col, id, (doc) => {
      setData(doc);
      setLoading(false);
    });
    return unsub;
  }, [col, id]);

  return { data, loading };
}
