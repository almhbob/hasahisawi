import Original from './bf-home';
export default function BFHome4K() {
  return (
    <div style={{ width:1620, height:2700, overflow:'hidden', background:'#050D0A' }}>
      <div style={{ transform:'scale(3)', transformOrigin:'top left', width:540, height:900 }}>
        <Original />
      </div>
    </div>
  );
}
