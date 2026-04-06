import Original from './booklet2-libraries';
export default function BookletLibraries4K() {
  return (
    <div style={{ width:1620, height:2700, overflow:'hidden', background:'#050E14' }}>
      <div style={{ transform:'scale(3)', transformOrigin:'top left', width:540, height:900 }}>
        <Original />
      </div>
    </div>
  );
}
