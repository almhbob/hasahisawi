import Original from './bf-market';
export default function BFMarket4K() {
  return (
    <div style={{ width:1620, height:2700, overflow:'hidden', background:'#050E0A' }}>
      <div style={{ transform:'scale(3)', transformOrigin:'top left', width:540, height:900 }}>
        <Original />
      </div>
    </div>
  );
}
