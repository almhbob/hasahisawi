// On web: redirect to the QR web-login page (camera scanner doesn't work in browser)
import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function QRScannerWebRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/qr-web-login" as any);
  }, []);
  return null;
}
