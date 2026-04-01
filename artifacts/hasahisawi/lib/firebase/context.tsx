import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { isFirebaseConfigured } from "./index";
import { onFirebaseAuthChange, isFirebaseAvailable } from "./auth";
import type { User } from "firebase/auth";

type FirebaseContextValue = {
  firebaseUser: User | null;
  isFirebaseReady: boolean;
  isConfigured: boolean;
};

const FirebaseContext = createContext<FirebaseContextValue>({
  firebaseUser: null,
  isFirebaseReady: false,
  isConfigured: false,
});

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);

  useEffect(() => {
    // إذا لم يكن Firebase مُهيَّئاً أو فشل سابقاً، تجاوزه فوراً
    if (!isFirebaseConfigured) {
      setIsFirebaseReady(true);
      return;
    }

    let unsub: (() => void) | undefined;
    try {
      unsub = onFirebaseAuthChange((user) => {
        setFirebaseUser(user);
        setIsFirebaseReady(true);
      });
    } catch (e) {
      // Firebase فشل في التهيئة — نتجاهل ونكمل
      console.warn("[Firebase] Provider init failed:", e);
      setIsFirebaseReady(true);
    }

    return () => {
      try { unsub?.(); } catch {}
    };
  }, []);

  return (
    <FirebaseContext.Provider
      value={{
        firebaseUser,
        isFirebaseReady,
        isConfigured: isFirebaseAvailable(),
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  return useContext(FirebaseContext);
}
