import UpdatePostV2 from "./update-post-v2";

export default function UpdatePostV24K() {
  const SCALE = 3, S = 540;
  return (
    <div style={{ width: S * SCALE, height: S * SCALE, overflow: "hidden", background: "#050D0A" }}>
      <div style={{ transform: `scale(${SCALE})`, transformOrigin: "top left", width: S, height: S }}>
        <UpdatePostV2 />
      </div>
    </div>
  );
}
