import { Composition } from "remotion";
import { QuoteVideo, calculateQuoteMetadata } from "./QuoteVideo";

export const RemotionRoot: React.FC = () => {
  return (
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
  );
};
