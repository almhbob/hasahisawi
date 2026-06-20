// Platform auth shim. Native imports are kept outside web files.
export const statusCodes = {
  SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
  IN_PROGRESS: "IN_PROGRESS",
  PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
};

export const GoogleSignin = {
  hasPlayServices: async () => true,
  signIn: async () => {
    throw new Error("Google native sign-in is not available on this platform");
  },
  configure: () => {},
  signOut: async () => {},
};
