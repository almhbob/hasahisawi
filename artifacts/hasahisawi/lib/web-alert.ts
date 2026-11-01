// على الويب: Alert.alert في react-native-web لا يعرض شيئاً، فكانت رسائل مثل «تم الحفظ» أو
// «حدث خطأ» وأسئلة التأكيد تختفي بصمت (نحو 800 استدعاء). نستبدله مرة واحدة عند بدء التطبيق
// بنوافذ المتصفح، مع تشغيل الزر الذي يختاره المستخدم.
import { Alert, Platform, type AlertButton, type AlertOptions } from "react-native";

let installed = false;

export function installWebAlert() {
  if (installed || Platform.OS !== "web" || typeof window === "undefined") return;
  installed = true;

  (Alert as any).alert = (title?: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
    const text = [title, message].filter((x) => x != null && String(x).trim() !== "").join("\n\n");
    const btns = (buttons || []).filter(Boolean);
    const cancel = btns.find((b) => b.style === "cancel");
    const actions = btns.filter((b) => b !== cancel);
    const dismiss = () => { cancel?.onPress?.(); options?.onDismiss?.(); };

    // بعد انتهاء الحدث الحالي حتى لا تتجمد واجهة الضغط أثناء ظهور النافذة
    setTimeout(() => {
      try {
        if (actions.length === 0) { window.alert(text); cancel?.onPress?.(); return; }
        if (actions.length === 1 && !cancel) { window.alert(text); actions[0].onPress?.(); return; }
        if (actions.length === 1) { if (window.confirm(text)) actions[0].onPress?.(); else dismiss(); return; }
        // عدة خيارات: قائمة مرقّمة
        const list = actions.map((b, i) => `${i + 1}. ${b.text ?? ""}`).join("\n");
        const ans = window.prompt(`${text}\n\n${list}\n\nاكتب رقم الخيار:`, "1");
        const pick = ans == null ? -1 : Number(String(ans).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))) - 1;
        if (actions[pick]) actions[pick].onPress?.(); else dismiss();
      } catch { /* نوافذ المتصفح محظورة (مثلاً داخل iframe) — نتجاهل */ }
    }, 0);
  };
}
