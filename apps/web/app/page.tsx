'use client';
import { useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../components/Icon';

const LANDING_TABS = [
  { key: 'spot', label: 'จับผิดภาพ', icon: 'brain', title: 'เกมจับผิดภาพ (Spot the Difference)', trains: 'ฝึกสมาธิทางสายตา (Visual Attention)',
    points: ['หาจุดที่แตกต่างระหว่างภาพสองภาพ ทีละจุดตามจังหวะของตัวเอง', 'กดผิดไม่หักคะแนน ลดความกดดันระหว่างเล่น', 'หาไม่เจอ? กดขอคำใบ้ได้ทุกเมื่อ'] },
  { key: 'oneback', label: 'One Back Task', icon: 'target', title: 'One Back Task', trains: 'ฝึกความจำใช้งาน (Working Memory)',
    points: ['ดูไพ่ทีละใบ แล้วตอบว่าตรงกับใบก่อนหน้าหรือไม่', 'วัดทั้งความถูกต้องและเวลาในการตอบสนอง', 'ความจำใช้งานเป็นด้านที่ลดลงชัดเจนในผู้ที่มีภาวะ MCI'] },
  { key: 'maze', label: 'เขาวงกต 3 มิติ', icon: 'compass', title: 'เกมเขาวงกต 3 มิติ (3D Maze)', trains: 'ฝึกการรับรู้เชิงพื้นที่ (Spatial Navigation)',
    points: ['หาทางออกในเขาวงกตเสมือนจริง', 'ฝึกการจดจำทิศทางและเส้นทาง ทักษะที่ช่วยลดการหลงทาง', 'การนำทางเชิงพื้นที่เป็นสัญญาณที่ลดลงตั้งแต่ระยะแรกของ MCI'] },
  { key: 'dash', label: 'แดชบอร์ดแพทย์', icon: 'barchart', title: 'แดชบอร์ดสำหรับแพทย์และผู้ดูแล', trains: 'ติดตามความก้าวหน้าได้จากระยะไกล',
    points: ['ดูคะแนนรายด้านเทียบกับค่าเริ่มต้น (Baseline) ของผู้ป่วยแต่ละคน', 'รับการแจ้งเตือนเมื่อผลการฝึกลดลงผิดปกติ', 'สร้างรายงานความก้าวหน้าเพื่อใช้ประกอบการรักษา'] },
];

const STAGES = [
  { step: 'ระยะที่ 1', name: 'สมองปกติ', text: 'สมองทำงานได้ตามปกติ ยังไม่มีอาการที่สังเกตได้', focus: false },
  { step: 'ระยะที่ 2', name: 'MCI', text: 'ความจำและสมาธิเริ่มลดลง คิดวิเคราะห์ช้าลง แต่ยังใช้ชีวิตประจำวันได้ด้วยตนเอง', focus: true },
  { step: 'ระยะที่ 3', name: 'สมองเสื่อม', text: 'ความจำเสื่อมรุนแรง ไม่สามารถใช้ชีวิตประจำวันได้เอง ต้องพึ่งพาผู้ดูแล', focus: false },
];
const CRITERIA = [
  'ตนเองหรือคนใกล้ชิดสังเกตว่าความคิดความจำเปลี่ยนไป',
  'ผลทดสอบทางประสาทจิตวิทยาพบการเสื่อมถอยอย่างน้อยหนึ่งด้าน',
  'ยังทำกิจวัตรประจำวันได้ด้วยตนเอง',
  'ยังไม่เข้าเกณฑ์การวินิจฉัยโรคสมองเสื่อม',
];
const DOMAINS = [
  { icon: 'target', name: 'สมาธิจดจ่อ', text: 'เผลอลืมสิ่งที่กำลังทำ เช่น ต้มน้ำทิ้งไว้แล้วลืม' },
  { icon: 'bulb', name: 'การวางแผนและตัดสินใจ', text: 'คิดวิเคราะห์ช้าลง แก้ปัญหาที่ซับซ้อนได้ยากขึ้น' },
  { icon: 'brain', name: 'การเรียนรู้และความจำ', text: 'ลืมนัดหมาย ลืมชื่อคนรู้จัก พูดหรือถามซ้ำ' },
  { icon: 'message', name: 'ภาษา', text: 'นึกคำไม่ออก เลือกใช้คำไม่ถูก พูดวนซ้ำ' },
  { icon: 'compass', name: 'การรับรู้เชิงพื้นที่', text: 'หลงทางง่าย จำเส้นทางที่เคยคุ้นเคยไม่ได้' },
  { icon: 'smile', name: 'การรับรู้ทางสังคม', text: 'วิตกกังวล ซึมเศร้า หรืออารมณ์แปรปรวนง่าย' },
];
const PRINCIPLES = [
  { icon: 'check', text: 'กดผิดไม่หักคะแนน เน้นกำลังใจมากกว่าการลงโทษ' },
  { icon: 'bulb', text: 'มีคำใบ้ช่วยเหลือเสมอเมื่อติด' },
  { icon: 'eye', text: 'ตัวอักษรใหญ่ อ่านง่าย ทุกหน้าจอ' },
  { icon: 'star', text: 'สอนวิธีเล่นแบบโต้ตอบก่อนเริ่มเกมจริง' },
];

export default function Landing() {
  const router = useRouter();
  const [tabKey, setTabKey] = useState(LANDING_TABS[0].key);
  const tab = LANDING_TABS.find((t) => t.key === tabKey) ?? LANDING_TABS[0];
  const openLogin = (role?: 'patient' | 'doctor') => router.push(role ? `/login?role=${role}` : '/login');

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = LANDING_TABS.findIndex((t) => t.key === tabKey) + (e.key === 'ArrowRight' ? 1 : -1);
    const next = LANDING_TABS[(i + LANDING_TABS.length) % LANDING_TABS.length].key;
    setTabKey(next);
    document.getElementById('lp-tab-' + next)?.focus();
  }

  return (
    <div className="lp">
      <header className="lp-nav dock">
        <div className="lp-nav-inner glass glass-bar">
          <div className="brand">
            <div className="brand-mark" style={{ width: 36, height: 36, borderRadius: 10 }}><Icon name="brain" size={20} color="#fff" /></div>
            <div className="brand-name" style={{ fontSize: '1.15rem' }}>CogniCare</div>
          </div>
          <nav className="lp-links" aria-label="ส่วนของหน้า">
            <a href="#what">MCI คืออะไร</a><a href="#types">ประเภทของ MCI</a><a href="#platform">แพลตฟอร์มของเรา</a>
          </nav>
          <button className="btn btn-primary btn-sm" onClick={() => openLogin()}>เข้าสู่ระบบ</button>
        </div>
      </header>

      <main>
        <section className="lp-wrap lp-hero">
          <h1>ความจำเริ่มเปลี่ยน<br /><em>ไม่ได้แปลว่าสายเกินไป</em></h1>
          <p className="lp-lead">CogniCare คือแพลตฟอร์มเกมฝึกสมองสำหรับผู้สูงอายุที่มีภาวะความบกพร่องทางการรู้คิดเล็กน้อย (MCI) ฝึกได้ที่บ้าน และให้แพทย์ติดตามความก้าวหน้าได้อย่างต่อเนื่อง</p>
          <div className="lp-audience">
            <button className="lp-aud-btn primary" onClick={() => openLogin('patient')}><small>สำหรับผู้สูงอายุ</small><span>เริ่มฝึกสมอง <Icon name="chevright" size={18} /></span></button>
            <button className="lp-aud-btn" onClick={() => openLogin('doctor')}><small>สำหรับแพทย์และผู้ดูแล</small><span>ติดตามผู้ป่วย <Icon name="chevright" size={18} /></span></button>
          </div>
          <div className="lp-games-row" aria-label="เกมในแพลตฟอร์ม">
            <div><Icon name="brain" size={18} /> จับผิดภาพ</div><div><Icon name="target" size={18} /> One Back Task</div><div><Icon name="compass" size={18} /> เขาวงกต 3 มิติ</div>
          </div>
        </section>

        <section id="what" className="lp-section"><div className="lp-wrap">
          <div className="lp-head"><h2>MCI คืออะไร</h2>
            <p>ภาวะความบกพร่องทางการรู้คิดเล็กน้อย (Mild Cognitive Impairment) คือภาวะที่อยู่ระหว่างการเสื่อมของสมองตามวัยปกติกับโรคสมองเสื่อม สมองทำงานลดลงมากกว่าที่คาดตามอายุ แต่ยังทำกิจวัตรประจำวันได้เองโดยไม่ต้องพึ่งผู้อื่น</p></div>
          <div className="lp-spectrum">
            {STAGES.map((st) => (
              <div key={st.step} className={'lp-stage' + (st.focus ? ' focus' : '')}>
                <div className="lp-step">{st.step}</div><h3>{st.name}</h3><p>{st.text}</p>
                {st.focus && <span className="lp-window">หน้าต่างแห่งโอกาส</span>}
              </div>
            ))}
          </div>
          <p className="lp-note">ระยะ MCI เหมาะที่สุดสำหรับการดูแลเชิงป้องกัน เพราะสมองยังปรับตัวและฟื้นฟูได้สูง (Neuroplasticity) การฝึกการรู้คิดซ้ำอย่างสม่ำเสมอช่วยเสริมสร้างพลังสำรองของสมอง (Cognitive Reserve) และชะลอการดำเนินของโรคได้</p>
          <div className="lp-criteria"><h3>แพทย์วินิจฉัย MCI เมื่อพบครบ 4 ข้อ</h3><ol>
            {CRITERIA.map((c, i) => <li key={c}><span className="lp-num">{i + 1}</span><span>{c}</span></li>)}
          </ol></div>
        </div></section>

        <section id="types" className="lp-section"><div className="lp-wrap">
          <div className="lp-head"><h2>MCI มี 4 ประเภท</h2>
            <p>แบ่งด้วยคำถามสองข้อ: ความจำบกพร่องหรือไม่ และบกพร่องเพียงด้านเดียวหรือหลายด้าน</p></div>
          <div className="lp-matrix" role="table" aria-label="ประเภทของ MCI">
            <div className="lp-axis lp-corner" role="columnheader"></div>
            <div className="lp-axis lp-col-axis" role="columnheader">บกพร่องด้านเดียว<small>Single Domain</small></div>
            <div className="lp-axis lp-col-axis" role="columnheader">บกพร่องหลายด้าน<small>Multiple Domain</small></div>
            <div className="lp-axis lp-row-axis" role="rowheader">ความจำบกพร่อง<small>Amnestic MCI</small></div>
            <div className="lp-cell" role="cell"><span className="lp-code">aMCI-sd</span><p>ความจำบกพร่องเพียงด้านเดียว</p><span className="lp-flag">พบบ่อยที่สุด · เสี่ยงต่ออัลไซเมอร์สูงสุด</span></div>
            <div className="lp-cell" role="cell"><span className="lp-code">aMCI-md</span><p>ความจำบกพร่องร่วมกับด้านอื่น เช่น ภาษาหรือการใช้เหตุผล</p></div>
            <div className="lp-axis lp-row-axis" role="rowheader">ด้านอื่นที่ไม่ใช่ความจำ<small>Non-Amnestic MCI</small></div>
            <div className="lp-cell" role="cell"><span className="lp-code">naMCI-sd</span><p>บกพร่องด้านเดียวที่ไม่ใช่ความจำ เช่น ภาษา หรือการรับรู้เชิงพื้นที่</p></div>
            <div className="lp-cell" role="cell"><span className="lp-code">naMCI-md</span><p>บกพร่องหลายด้านพร้อมกัน โดยความจำยังปกติ</p></div>
          </div>
          <div className="lp-head" style={{ margin: '56px 0 0' }}><h2 style={{ fontSize: '1.35rem' }}>6 ด้านของสมองที่ MCI อาจส่งผล</h2><p>ตามเกณฑ์ DSM-5 อาการที่พบได้ในชีวิตประจำวัน</p></div>
          <div className="lp-domains" style={{ marginTop: 20 }}>
            {DOMAINS.map((d) => (
              <div className="lp-domain" key={d.name}><div className="game-icon"><Icon name={d.icon} size={20} /></div><div><b>{d.name}</b><p>{d.text}</p></div></div>
            ))}
          </div>
        </div></section>

        <section id="platform" className="lp-section"><div className="lp-wrap">
          <div className="lp-head"><h2>CogniCare ช่วยอะไรได้บ้าง</h2>
            <p>เกมฝึกสมอง 3 เกมที่ออกแบบตามด้านของสมองที่ MCI ส่งผล ผู้สูงอายุฝึกได้นอกห้องพยาบาล ส่วนแพทย์เห็นข้อมูลการเล่นจริงเพื่อติดตามอาการ</p></div>
          <div className="lp-tabs" role="tablist" aria-label="ความสามารถของแพลตฟอร์ม">
            {LANDING_TABS.map((t) => {
              const on = t.key === tab.key;
              return (
                <button key={t.key} className="lp-tab" role="tab" id={'lp-tab-' + t.key} aria-controls="lp-panel" aria-selected={on}
                  tabIndex={on ? 0 : -1} onClick={() => setTabKey(t.key)} onKeyDown={onTabKey}>
                  <Icon name={t.icon} size={18} /> {t.label}
                </button>
              );
            })}
          </div>
          <div className="lp-panel" id="lp-panel" role="tabpanel" aria-labelledby={'lp-tab-' + tab.key}>
            <div><h3>{tab.title}</h3><div className="lp-trains">{tab.trains}</div><ul>
              {tab.points.map((p) => <li key={p}><Icon name="check" size={18} /><span>{p}</span></li>)}
            </ul></div>
            <div className="lp-visual" aria-hidden="true"><Icon name={tab.icon} size={96} /></div>
          </div>
          <div className="lp-principles">
            {PRINCIPLES.map((p) => <div className="lp-principle" key={p.text}><Icon name={p.icon} size={22} /><span>{p.text}</span></div>)}
          </div>
        </div></section>

        <section className="lp-wrap" style={{ paddingBottom: 24 }}>
          <div className="lp-cta"><h2>เริ่มฝึกสมองวันละไม่กี่นาที</h2>
            <p>ฝึกสม่ำเสมอในช่วง MCI คือโอกาสที่ดีที่สุดในการชะลอการดำเนินของโรค</p>
            <button className="btn" onClick={() => openLogin('patient')}>เริ่มต้นใช้งาน</button></div>
        </section>
      </main>

      <footer className="lp-wrap lp-footer">ข้อมูลอ้างอิงจากรายงานโครงงาน CprE69-1-03 · CogniCare เป็นเครื่องมือฝึกการรู้คิด ไม่ใช่เครื่องมือวินิจฉัยโรค หากกังวลเรื่องความจำ โปรดปรึกษาแพทย์</footer>
    </div>
  );
}
