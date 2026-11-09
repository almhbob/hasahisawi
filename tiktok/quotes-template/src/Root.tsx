import { Composition } from "remotion";
import { QuoteVideo, calculateQuoteMetadata } from "./QuoteVideo";
import { UnsaidVideo, calculateUnsaidMetadata } from "./unsaid/UnsaidVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="QuoteVideo"
        component={QuoteVideo}
        durationInFrames={480}
        fps={30}
        width={1080}
        height={1920}
        calculateMetadata={calculateQuoteMetadata}
        defaultProps={{
          day: 1,
          label: "حكمة اليوم",
          quote: "من جدّ وجد، ومن زرع حصد، ومن سار على الدرب وصل",
          author: "مثل عربي",
          tagline: "كل خدمات الحصاحيصا في تطبيق واحد",
          cta: "حمّله مجاناً من Google Play",
          screenshot: "screen-services.png",
        }}
      />
      <Composition
        id="UnsaidVideo"
        component={UnsaidVideo}
        durationInFrames={420}
        fps={30}
        width={1080}
        height={1920}
        calculateMetadata={calculateUnsaidMetadata}
        defaultProps={{
          n: 1,
          title: "خذلان",
          lines: [
            "حينما أخبرتك أني بخير..",
            "كنت أظنك ستعيد السؤال؛",
            "لكنك صدقتني!..",
          ],
          author: "عاصم عبدالرحمن محمد",
          authorNote: "كاتب سوداني من الحصاحيصا",
          cta: "تابع السلسلة… 50 نصاً لا تقال",
        }}
      />
    </>
  );
};
