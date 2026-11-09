import { AbsoluteFill, CalculateMetadataFunction } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Background } from "./Background";
import { Hook } from "./scenes/Hook";
import { Quote } from "./scenes/Quote";
import { Promo } from "./scenes/Promo";
import { HOOK_FRAMES, PROMO_FRAMES, TRANSITION_FRAMES, quoteFrames } from "./theme";

export type QuoteVideoProps = {
  day: number;
  label: string;
  quote: string;
  author: string;
  tagline: string;
  cta: string;
  screenshot: string;
};

export const calculateQuoteMetadata: CalculateMetadataFunction<QuoteVideoProps> = ({ props }) => ({
  durationInFrames: HOOK_FRAMES + quoteFrames(props.quote) + PROMO_FRAMES - 2 * TRANSITION_FRAMES,
});

export const QuoteVideo: React.FC<QuoteVideoProps> = (p) => {
  return (
    <AbsoluteFill>
      <Background />
      <TransitionSeries>
        <TransitionSeries.Sequence name="الافتتاحية" durationInFrames={HOOK_FRAMES}>
          <Hook label={p.label} day={p.day} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })} />
        <TransitionSeries.Sequence name="الحكمة" durationInFrames={quoteFrames(p.quote)}>
          <Quote quote={p.quote} author={p.author} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />
        <TransitionSeries.Sequence name="ترويج التطبيق" durationInFrames={PROMO_FRAMES}>
          <Promo tagline={p.tagline} cta={p.cta} screenshot={p.screenshot} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
