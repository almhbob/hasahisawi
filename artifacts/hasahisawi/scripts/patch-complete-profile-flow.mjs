import { readFileSync, writeFileSync } from 'node:fs';

function patchFile(relativePath, patcher) {
  const file = new URL(relativePath, import.meta.url);
  const before = readFileSync(file, 'utf8');
  const after = patcher(before);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`[patch-complete-profile-flow] patched ${relativePath}`);
  } else {
    console.log(`[patch-complete-profile-flow] ${relativePath} already clean`);
  }
}

patchFile('../app/_layout.tsx', (src) => {
  const oldBlock = `    // إذا لم يُحدَّد الجنس (مستخدم Google جديد) → أجبره على إكمال الملف
    const needsGender = !isGuest && user && !user.gender;
    if (needsGender && !inCompleteProfile) {
      router.replace("/complete-profile" as any);
      return;
    }

    if (inLogin || inOnboarding || inCompleteProfile) {
      router.replace("/(tabs)/" as any);
    }
  }, [user, isLoading, segments, isGuest]);`;

  const newBlock = `    // إذا لم يُحدَّد الجنس → أبقه في شاشة إكمال الملف حتى يحفظ.
    // كان الشرط القديم يعيد المستخدم من complete-profile إلى الرئيسية مباشرةً،
    // ثم يرجعه مرة أخرى إلى complete-profile، وهذا يسبب Maximum update depth exceeded.
    const needsGender = !isGuest && !!user && !user.gender;
    if (needsGender) {
      if (!inCompleteProfile) router.replace("/complete-profile" as any);
      return;
    }

    if (inLogin || inOnboarding || inCompleteProfile) {
      router.replace("/(tabs)/" as any);
    }
  }, [user?.id, user?.gender, isLoading, isGuest, segments.join("/")]);`;

  if (src.includes(newBlock)) return src;
  if (!src.includes(oldBlock)) {
    console.warn('[patch-complete-profile-flow] AuthGate block not found');
    return src;
  }
  return src.replace(oldBlock, newBlock);
});

patchFile('../lib/auth-context.tsx', (src) => {
  const oldBlock = `    setUser(prev => prev ? { ...prev, gender, ...(neighborhood ? { neighborhood } : {}) } : prev);
    try {
      const saved = await AsyncStorage.getItem(USER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify({ ...parsed, user: { ...(parsed.user ?? {}), gender, ...(neighborhood ? { neighborhood } : {}) } }));
      }
    } catch {}
  };`;

  const newBlock = `    const updatedUser = user ? { ...user, gender, ...(neighborhood ? { neighborhood } : {}) } : null;
    if (updatedUser) {
      setUser(updatedUser);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
    } else {
      setUser(prev => prev ? { ...prev, gender, ...(neighborhood ? { neighborhood } : {}) } : prev);
      try {
        const saved = await AsyncStorage.getItem(USER_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify({ ...parsed, gender, ...(neighborhood ? { neighborhood } : {}) }));
        }
      } catch {}
    }

    // Keep Firestore profile aligned for Firebase/Google accounts. This is best-effort
    // and does not block the user from completing the profile.
    if (user?.uid) {
      fsSetDoc(
        COLLECTIONS.USERS,
        user.uid,
        { uid: user.uid, name: user.name, email: user.email ?? undefined, phone: user.phone ?? undefined, role: user.role === "guest" ? "user" : user.role, permissions: user.permissions ?? [], gender, ...(neighborhood ? { neighborhood } : {}) },
        true,
      ).catch(() => {});
    }
  };`;

  if (src.includes(newBlock)) return src;
  if (!src.includes(oldBlock)) {
    console.warn('[patch-complete-profile-flow] completeProfile storage block not found');
    return src;
  }
  return src.replace(oldBlock, newBlock);
});
