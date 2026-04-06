import Original from './booklet2-phones';
export default function BookletPhones4K() {
  return (
    <div style={{ width:1620, height:2700, overflow:'hidden', background:'#090814' }}>
      <div style={{ transform:'scale(3)', transformOrigin:'top left', width:540, height:900 }}>
        <Original />
      </div>
    </div>
  );
}
