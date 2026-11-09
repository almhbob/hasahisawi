import { AbsoluteFill, CalculateMetadataFunction } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { UnsaidBackground } from "./UnsaidBackground";
import { UnsaidHook } from "./UnsaidHook";
import { UnsaidText } from "./UnsaidText";
import { UnsaidOutro } from "./UnsaidOutro";
import { U_HOOK, U_OUTRO, U_TRANSITION, unsaidTextFrames } from "./theme";

export type UnsaidVideoProps = {
  n: number;
  title: string;
  lines: string[];
  author: string;
  authorNote: string;
  cta: string;
  sponsorName?: string;
  sponsorLogo?: string;
};

export const calculateUnsaidMetadata: CalculateMetadataFunction<
  UnsaidVideoProps
> = ({ props }) => ({
  durationInFrames:
    U_HOOK + unsaidTextFrames(props.lines) + U_OUTRO - 2 * U_TRANSITION,
});

export const UnsaidVideo: React.FC<UnsaidVideoProps> = (p) => {
  const t = linearTiming({ durationInFrames: U_TRANSITION });
  return (
    <AbsoluteFill>
      <UnsaidBackground />
      <TransitionSeries>
        <TransitionSeries.Sequence name="الافتتاحية" durationInFrames={U_HOOK}>
          <UnsaidHook n={p.n} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={t} />
        <TransitionSeries.Sequence
          name="النص"
          durationInFrames={unsaidTextFrames(p.lines)}
        >
          <UnsaidText title={p.title} lines={p.lines} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={t} />
        <TransitionSeries.Sequence
          name="الكتاب والكاتب"
          durationInFrames={U_OUTRO}
        >
          <UnsaidOutro
            author={p.author}
            authorNote={p.authorNote}
            cta={p.cta}
            sponsorName={p.sponsorName}
            sponsorLogo={p.sponsorLogo}
          />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
