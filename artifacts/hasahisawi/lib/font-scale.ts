/**
 * سقف تكبير الخط على الهاتف (Text و TextInput).
 *
 * في React 19 لا تعمل defaultProps مع المكوّنات الدالّية، وText وTextInput في React Native 0.81
 * مكوّنات دالّية؛ لذلك كان السقف المضبوط سابقاً بـ defaultProps مُهمَلاً تماماً، فإذا كبّر المستخدم خط
 * الهاتف كبر النص داخل الخانات بلا حد فخرج عن ارتفاعها واختفى أو قُصّ (خانات التاريخ والإدخال).
 *
 * الحل: نستبدل Text وTextInput المصدَّرين من react-native بغلاف يمرّر maxFontSizeMultiplier افتراضياً
 * (ما لم تحدده الشاشة بنفسها). الشاشات تقرأ `_reactNative.Text` عند الرسم، فيكفي التثبيت قبل أول رسم.
 */
import React from "react";
import { Platform } from "react-native";

const caps = { text: 1.25, input: 1.2 };
/** يُستدعى من وضع المكفوفين عند تفعيل «تكبير الخط» */
export function setFontCaps(text: number, input: number) { caps.text = text; caps.input = input; }

let installed = false;
function install() {
  if (installed || Platform.OS === "web") return; // الويب لا يتأثر بخط النظام
  installed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require("react-native");
    const OrigText = RN.Text;
    const OrigInput = RN.TextInput;
    const CappedText = (props: any) => React.createElement(OrigText, { maxFontSizeMultiplier: caps.text, ...props });
    const CappedInput = (props: any) => React.createElement(OrigInput, { maxFontSizeMultiplier: caps.input, ...props });
    // الخصائص الثابتة (مثل TextInput.State) تبقى متاحة لمن يستخدمها
    Object.assign(CappedInput, OrigInput);
    (CappedText as any).displayName = "Text";
    (CappedInput as any).displayName = "TextInput";
    Object.defineProperty(RN, "Text", { configurable: true, enumerable: true, get: () => CappedText });
    Object.defineProperty(RN, "TextInput", { configurable: true, enumerable: true, get: () => CappedInput });
  } catch { /* إن تعذّر الاستبدال يبقى السلوك الافتراضي */ }
}
install();
