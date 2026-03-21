import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { isFirebaseConfigured } from "./index";
import { onFirebaseAuthChange } from "./auth";
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
    if (!isFirebaseConfigured) {
      setIsFirebaseReady(true);
      return;
    }
    const unsub = onFirebaseAuthChange((user) => {
      setFirebaseUser(user);
      setIsFirebaseReady(true);
    });
    return unsub;
  }, []);

  return (
    <FirebaseContext.Provider
      value={{ firebaseUser, isFirebaseReady, isConfigured: isFirebaseConfigured }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  return useContext(FirebaseContext);
}
