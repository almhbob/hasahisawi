import Original from './booklet2-women';
export default function BookletWomen4K() {
  return (
    <div style={{ width:1620, height:2700, overflow:'hidden', background:'#120A14' }}>
      <div style={{ transform:'scale(3)', transformOrigin:'top left', width:540, height:900 }}>
        <Original />
      </div>
    </div>
  );
}
