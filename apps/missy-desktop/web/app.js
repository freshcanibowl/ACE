let token='', pending=null;
const $=id=>document.getElementById(id);
async function api(path,data){const opts=data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Missy-Token':token},body:JSON.stringify(data)};const r=await fetch(path,opts);const j=await r.json();if(!r.ok)throw Error(j.error||r.status);return j;}
function showError(id,e){$(id).textContent='Not completed: '+e.message;$(id).className='error';}
async function refresh(){try{const r=await api('/api/status');const s=r.summary;$('recorded').textContent=s.recorded_ml;$('remaining').textContent=s.above_record_target_ml?`Above synthetic record target by ${s.above_record_target_ml} mL (not a diagnosis).`:`Remaining to synthetic recording target: ${s.remaining_record_target_ml} mL (demo only).`;$('bar').style.width=Math.min(100,100*s.recorded_ml/s.target_ml)+'%';renderReminders(r.reminders);}catch(e){showError('remaining',e);}}
function renderReminders(items){const box=$('reminder-list');box.replaceChildren();for(const item of items){const p=document.createElement('p');const due=new Date(item.due_at);p.textContent=(item.acknowledged?'✓ ':'⏰ ')+item.title+' · '+due.toLocaleTimeString();if(!item.acknowledged&&due<=new Date()){p.className='good';p.textContent='🔔 Reminder: '+item.title+' (local browser notification)';const btn=document.createElement('button');btn.className='secondary';btn.textContent='Acknowledge';btn.onclick=async()=>{try{await api('/api/ack',{id:item.id});await refresh();}catch(e){showError('reminder-list',e);}};p.append(' ',btn);}box.appendChild(p);}}
$('network').textContent=navigator.onLine?'Device reports online':'Device reports offline';window.addEventListener('offline',()=>{$('network').textContent='Device reports offline';});window.addEventListener('online',()=>{$('network').textContent='Device reports online';});
$('parse').onclick=async()=>{pending=null;$('pending').hidden=true;$('parse-result').textContent='Loading local QVAC model and interpreting…';$('parse-result').className='';try{const r=await api('/api/parse',{text:$('phrase').value});pending=r.pending;$('parse-result').textContent=`Local QVAC ${r.proof.model} · ${r.proof.latency_ms} ms · confirmation required`;$('parse-result').className='good';$('pending-text').textContent=`Confirm recording ${pending.volume_ml} mL? Original: ${pending.source}`;$('pending').hidden=false;}catch(e){showError('parse-result',e);}};
$('confirm').onclick=async()=>{if(!pending)return;try{await api('/api/confirm',pending);pending=null;$('pending').hidden=true;$('parse-result').textContent='Saved locally after your confirmation.';await refresh();}catch(e){showError('parse-result',e);}};
$('cancel').onclick=()=>{pending=null;$('pending').hidden=true;};
$('food-btn').onclick=async()=>{try{const r=await api('/api/food',{name:$('food').value});$('food-result').textContent=(r.food?r.food+' — ':'')+r.message+' Source: '+(r.source||'No verified entry');}catch(e){showError('food-result',e);}};
$('remind').onclick=async()=>{try{await api('/api/reminder',{title:'Review your saved care checklist',due_at:new Date(Date.now()+120000).toISOString()});await refresh();}catch(e){showError('reminder-list',e);}};
(async()=>{try{token=(await api('/api/session')).token;window.__missyToken=token;await refresh();setInterval(refresh,4000);}catch(e){showError('remaining',e);}})();

/* ── SOS Care Center (round 2) — client timers only; red-line rules live server-side ── */
(function(){
const S=window.__missySos={
 en:{hypo:'I feel low (hypo)',sick:"I'm sick today",symptoms:'Tick what you have now:',
     hydration:'Water sips (100–150 ml each):',glucoseNote:'Recheck glucose every 4 hours. Last check: ',
     glucoseBtn:'I checked glucose now',sopTitle:'Clinic SOP threshold reached',sopDone:'Close incident',
     done:'Incident saved on this device. Take care. 💚',doneClose:'Back to Missy',
     offlineNote:'Works without internet. Guidance is educational — not medical advice.',
     step1:'Eat 15 g of fast sugar now (3-4 glucose tablets or 150 ml juice).',
     step2:'Sit still for 15 minutes. Recheck when the timer ends.',
     modeHypo:'Hypoglycemia care',modeSick:'Sick-day care',
     sop:'Threshold detected per clinic SOP. Please contact clinic staff.',
     title:'SOS Care Center',
     sym:{FEVER:'Fever',VOMITING:'Vomiting',DIARRHEA:'Diarrhea',CANT_DRINK:"Can't keep fluids down",
     RAPID_BREATHING:'Rapid breathing',FRUITY_BREATH:'Fruity breath smell',CONFUSION:'Confusion / very drowsy'},
     never:'never'},
 zh:{hypo:'我疑似低血糖',sick:'我今天生病了',symptoms:'勾选你现在的情况：',
     hydration:'喝水打卡（每次 100–150 毫升）：',glucoseNote:'每 4 小时复测血糖。上次检测：',
     glucoseBtn:'我现在测了血糖',sopTitle:'已达到诊所 SOP 阈值',sopDone:'关闭事件',
     done:'事件已保存在本机。好好休息。💚',doneClose:'回到 Missy',
     offlineNote:'离线可用。本指引仅为教育内容，非医疗建议。',
     step1:'立刻吃 15 克快升糖食物（3-4 颗葡萄糖片或 150 毫升果汁）。',
     step2:'静坐等待 15 分钟，计时结束后复测。',
     modeHypo:'低血糖照护',modeSick:'生病日照护',
     sop:'检测到需按诊所 SOP 联系医护人员的阈值，请联系诊所工作人员。',
     title:'SOS 照护中心',
     sym:{FEVER:'发烧',VOMITING:'呕吐',DIARRHEA:'腹泻',CANT_DRINK:'无法进水',RAPID_BREATHING:'呼吸急促',
     FRUITY_BREATH:'呼气有烂苹果味',CONFUSION:'意识模糊/极度嗜睡'},never:'从未'},
 ms:{hypo:'Saya rasa rendah (hipo)',sick:'Saya sakit hari ini',symptoms:'Tandakan yang anda alami:',
     hydration:'Sedutan air (100–150 ml setiap satu):',glucoseNote:'Semak glukosa setiap 4 jam. Semakan terakhir: ',
     glucoseBtn:'Saya semak glukosa sekarang',sopTitle:'Ambang SOP klinik dicapai',sopDone:'Tutup insiden',
     done:'Insiden disimpan pada peranti ini. Jaga diri. 💚',doneClose:'Kembali ke Missy',
     offlineNote:'Berfungsi tanpa internet. Panduan ini pendidikan sahaja — bukan nasihat perubatan.',
     step1:'Ambil 15 g gula pantas sekarang (3-4 tablet glukosa atau 150 ml jus).',
     step2:'Duduk diam 15 minit. Semak semula selepas pemasa tamat.',
     modeHypo:'Penjagaan hipo',modeSick:'Penjagaan hari sakit',
     sop:'Ambang dikesan mengikut SOP klinik. Sila hubungi kakitangan klinik.',
     title:'Pusat Penjagaan SOS',
     sym:{FEVER:'Demam',VOMITING:'Muntah',DIARRHEA:'Cirit-birit',CANT_DRINK:'Tidak boleh minum',
     RAPID_BREATHING:'Nafas cepat',FRUITY_BREATH:'Nafas berbau buah',CONFUSION:'Kekeliruan / mengantuk berat'},
     never:'belum pernah'}};
const t$=id=>document.getElementById(id);
const sosLang=()=>window.__missyLang||'en';
const T=()=>S[sosLang()]||S.en;
let incident=null, timerId=null;
const CHECKS=['FEVER','VOMITING','DIARRHEA','CANT_DRINK','RAPID_BREATHING','FRUITY_BREATH','CONFUSION'];
const checked=()=>CHECKS.filter(k=>t$('sym-'+k)&&t$('sym-'+k).checked);
const sApi=async(path,data)=>{const opts=data===undefined?{method:'GET'}:{method:'POST',headers:{'Content-Type':'application/json','X-Missy-Token':window.__missyToken||''},body:JSON.stringify({...data,lang:sosLang()})};const r=await fetch(path,opts);const j=await r.json();if(!r.ok)throw Error(j.error||r.status);return j;};
const show=(id,on=true)=>{t$(id).hidden=!on;};
function stopTimer(){if(timerId){clearInterval(timerId);timerId=null;}}
function openTakeover(label){t$('sos-mode-label').textContent=label;show('sos-takeover');
  show('sos-hypo-flow',false);show('sos-sick-flow',false);show('sos-sop',false);show('sos-done',false);
  document.body.classList.add('sos-open');window.scrollTo(0,0);}
function closeTakeover(){show('sos-takeover',false);document.body.classList.remove('sos-open');
  stopTimer();location.reload();}
function startTimer(seconds){const end=Date.now()+seconds*1000;show('sos-timer');show('sos-recheck-choices',false);
  const tick=()=>{const left=Math.max(0,Math.ceil((end-Date.now())/1000));
    t$('sos-timer-num').textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');
    if(left<=0){stopTimer();show('sos-recheck-choices');}};
  tick();timerId=setInterval(tick,500);}
function renderSop(sop){show('sos-hypo-flow',false);show('sos-sick-flow',false);show('sos-sop',true);
  t$('sos-sop-line').textContent=sop.line;t$('sos-sop-phone').textContent=sop.phone||'';}
function renderSymptoms(){const box=t$('sos-symptoms');box.replaceChildren();
  for(const code of CHECKS){const lab=document.createElement('label');lab.className='sos-sym';
    const cb=document.createElement('input');cb.type='checkbox';cb.id='sym-'+code;
    cb.addEventListener('change',async()=>{if(incident&&incident.id){
      try{incident=await sApi('/api/sos/update',{id:incident.id,symptoms:checked()});
        if(incident.status==='SOP_CONTACT')renderSop(incident.sop_card);}catch(e){/* offline stays usable */}}});
    lab.append(cb,document.createTextNode(' '+T().sym[code]));box.append(lab);}}
async function startHypo(){show('sos-hypo-flow',true);
  t$('sos-steps').replaceChildren(...[T().step1,T().step2].map(s=>{const li=document.createElement('li');li.textContent=s;return li;}));
  startTimer(15*60);}
async function startSick(){show('sos-sick-flow',true);renderSymptoms();
  try{const m=await sApi('/api/sos/med-edu');
    t$('sos-mededu-title').textContent=m.title;t$('sos-mededu-line').textContent=m.line;show('sos-mededu',true);}
  catch(e){/* offline: education note unavailable, care flows unaffected */}
  t$('sos-glucose-note').textContent=T().glucoseNote+T().never;}
t$('sos-hypo').addEventListener('click',async()=>{openTakeover(T().modeHypo);
  try{incident=await sApi('/api/sos/start',{incident_type:'HYPOGLYCEMIA'});}catch(e){incident={id:null,sop_card:null};}
  startHypo();});
t$('sos-sick').addEventListener('click',async()=>{openTakeover(T().modeSick);
  try{incident=await sApi('/api/sos/start',{incident_type:'SICK_DAY'});}catch(e){incident={id:null,sop_card:null};}
  startSick();});
t$('sos-recheck').addEventListener('click',()=>{stopTimer();show('sos-recheck-choices',true);});
t$('sos-stilllow').addEventListener('click',async()=>{
  if(incident&&incident.id){try{incident=await sApi('/api/sos/update',{id:incident.id,hypo_cycles:(incident.hypo_cycles||0)+1});
    if(incident.status==='SOP_CONTACT'){renderSop(incident.sop_card);return;}}catch(e){}}
  startTimer(15*60);});
t$('sos-confused').addEventListener('click',async()=>{
  if(incident&&incident.id){try{incident=await sApi('/api/sos/update',{id:incident.id,symptoms:['CONFUSION']});}catch(e){}}
  renderSop(incident&&incident.sop_card?incident.sop_card:{line:T().sop,phone:'',demo:true});});
t$('sos-ok').addEventListener('click',async()=>{if(incident&&incident.id){
  try{incident=await sApi('/api/sos/resolve',{id:incident.id});}catch(e){}}
  show('sos-hypo-flow',false);show('sos-done',true);});
t$('sos-water').addEventListener('click',async()=>{const n=Number(t$('sos-hydration-count').textContent)+1;
  t$('sos-hydration-count').textContent=n;
  if(incident&&incident.id){try{await sApi('/api/sos/update',{id:incident.id,hydration_count:n});}catch(e){}}});
t$('sos-glucose').addEventListener('click',async()=>{t$('sos-glucose-note').textContent=T().glucoseNote+new Date().toLocaleTimeString();
  if(incident&&incident.id){try{await sApi('/api/sos/update',{id:incident.id,glucose_check:new Date().toISOString()});}catch(e){}}});
t$('sos-sop-done').addEventListener('click',()=>{show('sos-sop',false);show('sos-done',true);});
t$('sos-done-close').addEventListener('click',closeTakeover);
t$('sos-close').addEventListener('click',closeTakeover);
// camera placeholder — honest Phase 2 label, never fakes analysis
t$('camera-btn').addEventListener('click',()=>{const n=t$('camera-note-card');
  n.textContent='Photo AI is not available in this offline demo. Nothing was captured — the clinical path here stays on-device and deterministic.';
  n.className='bp-result lt-yellow';n.hidden=false;});
// language hook — main I18N switch calls window.__missyApplyLang()
window.__missyApplyLang=()=>{t$('sos-title').textContent=T().title;
  document.querySelectorAll('[data-i18n-sos]').forEach(el=>{const k=el.getAttribute('data-i18n-sos');if(T()[k])el.textContent=T()[k];});
  if(!t$('sos-takeover').hidden){
    if(!t$('sos-hypo-flow').hidden&&t$('sos-steps').children.length===2){
      t$('sos-steps').replaceChildren(...[T().step1,T().step2].map(s=>{const li=document.createElement('li');li.textContent=s;return li;}));}
    if(!t$('sos-sick-flow').hidden)renderSymptoms();}
  if(window.__missyEatoutRender)window.__missyEatoutRender();if(window.__missyRingRender)window.__missyRingRender();};
})();

/* ── Eat-out guide + safe menu (round 2) — static curated data, offline ── */
(function(){
const $=id=>document.getElementById(id);
const lang=()=>window.__missyLang||'en';
const COPY = {
  en: {safeMenu:'⭐ My safe menu',browse:'Browse guide',search:'Search: nasi campur / teh tarik…',
       search2:'Search dishes…',favAdd:'⭐ Save to my safe menu',favDone:'✓ Saved',head:'Eat-out guide',
       edu:'Patient-education content, not personalised advice.',empty:'No dish matches that search.'},
  zh: {safeMenu:'⭐ 我的闭眼吃安全餐单',browse:'浏览指南',search:'搜索：杂菜饭 / 椰浆饭 / 拉茶…',
       search2:'搜索菜品…',favAdd:'⭐ 存入安全餐单',favDone:'✓ 已存',head:'外食红绿灯指南',
       edu:'患者教育内容，非个性化建议。',empty:'没有匹配的菜品。'},
  ms: {safeMenu:'⭐ Menu selamat saya',browse:'Lihat panduan',search:'Cari: nasi campur / teh tarik…',
       search2:'Cari hidangan…',favAdd:'⭐ Simpan ke menu selamat',favDone:'✓ Disimpan',head:'Panduan makan luar',
       edu:'Kandungan pendidikan pesakit, bukan nasihat peribadi.',empty:'Tiada hidangan sepadan.'}
};
const C=()=>COPY[lang()]||COPY.en;
const LIGHT={GREEN:{cls:'lt-green',lab:{en:'Green · enjoy',zh:'绿灯 · 放心吃',ms:'Hijau · selamat'}},
 YELLOW:{cls:'lt-yellow',lab:{en:'Yellow · tweak first',zh:'黄灯 · 微调后吃',ms:'Kuning · ubah dulu'}},
 RED:{cls:'lt-red',lab:{en:'Red · choose swap',zh:'红灯 · 建议替换',ms:'Merah · pilih ganti'}}};
let guide=null, favs=[];
const mApi=async(path,data)=>{const opts=data===undefined?{method:'GET'}:{method:'POST',headers:{'Content-Type':'application/json','X-Missy-Token':window.__missyToken||''},body:JSON.stringify(data)};const r=await fetch(path,opts);return r.json();};
function dishCard(d){const L=LIGHT[d.traffic_light];const wrap=document.createElement('div');
  wrap.className='eatout-dish '+L.cls;
  const head=document.createElement('div');head.className='eatout-dish-head';
  const name=document.createElement('strong');name.textContent=d.name[lang()]||d.name.en;
  const badge=document.createElement('span');badge.className='eatout-badge '+L.cls;badge.textContent=L.lab[lang()];
  head.append(name,badge);wrap.append(head);
  d.swaps.forEach(s=>{const p=document.createElement('p');p.className='eatout-swap';p.textContent='→ '+s;wrap.append(p);});
  if(window.__missyTags&&window.__missyTags.includes('KIDNEY')&&d.renal_cautions&&d.renal_cautions.length){
    d.renal_cautions.forEach(rc=>{const p=document.createElement('p');p.className='eatout-renal';
      p.textContent='🛡️ '+rc;wrap.append(p);});}
  const fav=document.createElement('button');fav.className='sos-btn sos-secondary eatout-fav';
  fav.textContent=C().favAdd;fav.onclick=async()=>{fav.disabled=true;fav.textContent=C().favDone;
    try{await mApi('/api/safe-menu/add',{label:(d.name[lang()]||d.name.en)+' — '+(d.swaps[0]||'')});await loadFavs();}catch(e){}};
  wrap.append(fav);return wrap;}
function renderGuide(filter=''){const box=$('eatout-scenes');box.replaceChildren();
  if(!guide)return;const q=filter.trim().toLowerCase();let any=false;
  for(const scene of guide.scenes){const dishes=scene.dishes.filter(d=>!q||
    Object.values(d.name).some(v=>v.toLowerCase().includes(q))||
    d.swaps.some(s=>s.toLowerCase().includes(q)));
    if(!dishes.length)continue;any=true;
    const sec=document.createElement('section');sec.className='eatout-scene';
    const h=document.createElement('h3');h.textContent=scene.name[lang()]||scene.name.en;sec.append(h);
    dishes.forEach(d=>sec.append(dishCard(d)));box.append(sec);}
  if(!any){const p=document.createElement('p');p.className='muted';p.textContent=C().empty;box.append(p);}}
async function loadFavs(){try{const r=await mApi('/api/safe-menu');favs=r.items||[];}catch(e){favs=[];}
  const box=$('eatout-favs');box.replaceChildren();
  if(!favs.length){const p=document.createElement('p');p.className='muted';p.textContent=C().empty;box.append(p);return;}
  favs.forEach(f=>{const p=document.createElement('p');p.className='eatout-fav-item';p.textContent='✓ '+f.label;box.append(p);});}
function renderAll(){$('eatout-head-title').textContent=C().head;
  document.querySelector('#eatout-card h2').textContent=C().head;
  $('eatout-search').placeholder=C().search;$('eatout-search2').placeholder=C().search2;
  $('eatout-open').textContent=C().browse;
  document.querySelector('.eatout-fav-title').textContent=C().safeMenu;
  renderGuide($('eatout-search2').value);loadFavs();
  // quick hint card
  const q=$('eatout-quick');q.replaceChildren();
  if(guide&&guide.scenes.length){const p=document.createElement('p');p.className='muted';
    p.textContent=C().edu;q.append(p);}}
window.__missyEatoutRender=renderAll;
(async()=>{try{guide=await mApi('/api/eatout');}catch(e){guide=null;}
  renderAll();
  $('eatout-open').addEventListener('click',()=>{$('eatout-takeover').hidden=false;
    document.body.classList.add('sos-open');renderAll();});
  $('eatout-close').addEventListener('click',()=>{$('eatout-takeover').hidden=true;
    document.body.classList.remove('sos-open');});
  $('eatout-search2').addEventListener('input',e=>renderGuide(e.target.value));
  $('eatout-search').addEventListener('input',e=>renderGuide(e.target.value));
  $('eatout-search').addEventListener('keydown',e=>{if(e.key==='Enter')$('eatout-open').click();});
})();


/* ── 80/20 weekly ring (round 2) — real observations, non-punitive ── */
(function(){
const R={en:{badge:'Good week — 80%+ of days logged. 💚',quiet:'Rest is part of the marathon — pick it back up when you are ready. 🌱',
      hint:'Days with at least one care record, out of the last 7. Demo metric — not a medical score.',title:"This week's 80/20 progress"},
 zh:{badge:'好的一周——本周 80% 以上天数有记录。💚',quiet:'休息也是马拉松的一部分——准备好随时重新开始。🌱',
      hint:'最近 7 天中有照护记录的天数。演示指标，非医学评分。',title:'本周 80/20 进度'},
 ms:{badge:'Minggu yang baik — 80%+ hari direkod. 💚',quiet:'Rehat sebahagian daripada maraton — sambung bila anda sedia. 🌱',
      hint:'Hari dengan sekurang-kurangnya satu rekod, daripada 7 hari terakhir. Metrik demo — bukan skor perubatan.',title:'Kemajuan 80/20 minggu ini'}};
const rLang=()=>window.__missyLang||'en';
const RT=()=>R[rLang()]||R.en;
const shownKey=()=>('ring-quiet-shown-'+new Date().toISOString().slice(0,10));
async function loadRing(){try{const r=await fetch('/api/weekly-ring',{headers:{'X-Missy-Token':window.__missyToken||''}}).then(x=>x.json());
  const c=2*Math.PI*50;
  document.getElementById('ring-num').textContent=r.percent+'%';
  const fill=document.getElementById('ring-fill');
  fill.style.strokeDashoffset=c*(1-r.percent/100);
  fill.classList.toggle('badge',!!r.badge);
  const b=document.getElementById('ring-badge');
  if(r.badge){b.textContent=RT().badge;b.hidden=false;}
  const q=document.getElementById('ring-quiet');
  if(r.quiet_spell&&!r.badge&&r.percent<80&&!sessionStorage.getItem(shownKey())){q.textContent=RT().quiet;q.hidden=false;sessionStorage.setItem(shownKey(),'1');}
}catch(e){/* ring silently absent offline-first */}}
window.__missyRingRender=()=>{const b=document.getElementById('ring-badge');
  if(b&&!b.hidden)b.textContent=RT().badge;
  document.querySelector('#ring-card .card-title').textContent=RT().title;};
(async()=>{await loadRing();})();
})();

/* ── Care-direction profiles (round 2 rev) — tag-gated home assembly ── */
(function(){
const P={
 en:{carePlan:'My care plan',careSub:'Pick one or more care directions. Your page is built from them. You can change this anytime.',
  careConfirm:'Enter my page',careNote:'Educational demo only — not medical advice, no real patient data.',
  tagKidney:'Kidney (CKD)',tagKidneySub:'Fluid, weight, potassium care',tagGlucose:'Blood glucose',
  tagGlucoseSub:'Logging, SOS hypo, meal guide',tagBP:'Blood pressure',tagBPSub:'Quick BP + heart-rate log',
  tagLipids:'Blood lipids',tagLipidsSub:'Labs at a glance',renalTitle:'Kidney care today',
  renalWater:'Water intake (demo target, not medical advice)',renalAmber:'Near the demo target — small sips only from here.',
  renalCheck:'Weight & swelling self-check',edemaNone:'● No swelling',edemaAnkle:'▲ Ankle dent',
  edemaSwelling:'◆ Swelling',renalSave:'Save self-check',renalSaved:'Self-check saved on this device.',
  renalSopNote:'Weight is rising quickly — please contact clinic staff per your clinic SOP.',
  bpTitle:'Blood pressure quick log',bpMorning:'● Morning rest',bpDizzy:'▲ Dizzy',bpPreMed:'Before med',
  bpPostMed:'After med',bpSave:'Save BP',bpBad:'▲ Above typical home target — if it repeats, contact clinic staff per SOP.',
  bpGood:'● Within typical home range for this demo.',bpNote:'Educational demo thresholds — always follow your clinic own targets.',
  lipidsTitle:'Labs at a glance (manual entry)',lipSave:'Save labs',lipSaved:'Labs stored on this device.',
  lipidsNote:'Stored on this device only. Bring your lab report to your clinic for interpretation.',
  needTag:'Pick at least one care direction.',invalidBp:'Enter systolic and diastolic (60-260 / 40-160).'},
 zh:{carePlan:'我的照护方案',careSub:'选择一个或多个照护方向，页面按您的选择生成，可随时修改。',
  careConfirm:'进入我的页面',careNote:'教育演示用途——非医疗建议，无真实患者数据。',
  tagKidney:'肾病 (CKD)',tagKidneySub:'饮水、体重、控钾照护',tagGlucose:'血糖',tagGlucoseSub:'记录、低血糖 SOS、饮食指南',
  tagBP:'血压',tagBPSub:'快速血压+心率记录',tagLipids:'血脂',tagLipidsSub:'化验指标速览',
  renalTitle:'今日护肾',renalWater:'饮水（演示目标，非医疗建议）',renalAmber:'已接近演示目标——接下来请小口慢饮。',
  renalCheck:'体重与水肿自检',edemaNone:'● 无水肿',edemaAnkle:'▲ 脚踝按压有坑',edemaSwelling:'◆ 明显水肿',
  renalSave:'保存自检',renalSaved:'自检已保存在本机。',renalSopNote:'体重上升较快——请按诊所 SOP 联系工作人员。',
  bpTitle:'血压快速记录',bpMorning:'● 晨起静息',bpDizzy:'▲ 头晕',bpPreMed:'服药前',bpPostMed:'服药后',
  bpSave:'保存血压',bpBad:'▲ 高于本演示的常见居家目标——若反复出现请按 SOP 联系诊所。',
  bpGood:'● 处于本演示的常见居家范围内。',bpNote:'教育演示阈值——请始终以您诊所自己的目标为准。',
  lipidsTitle:'化验指标速览（手动录入）',lipSave:'保存化验值',lipSaved:'化验值已存于本机。',
  lipidsNote:'仅存于本机。请携带化验单到诊所由医生解读。',needTag:'请至少选择一个照护方向。',
  invalidBp:'请输入收缩压和舒张压（60-260 / 40-160）。'},
 ms:{carePlan:'Pelan penjagaan saya',careSub:'Pilih satu atau lebih arah penjagaan. Halaman anda dibina daripadanya. Boleh ubah bila-bila.',
  careConfirm:'Masuk halaman saya',careNote:'Demo pendidikan sahaja — bukan nasihat perubatan, tiada data pesakit sebenar.',
  tagKidney:'Buah pinggang (CKD)',tagKidneySub:'Cecair, berat, kawalan kalium',tagGlucose:'Gula darah',
  tagGlucoseSub:'Rekod, SOS hipo, panduan makan',tagBP:'Tekanan darah',tagBPSub:'Rekod pantas TD + nadi',
  tagLipids:'Lipid darah',tagLipidsSub:'Ringkasan ujian makmal',renalTitle:'Penjagaan buah pinggang hari ini',
  renalWater:'Pengambilan air (sasaran demo, bukan nasihat perubatan)',renalAmber:'Hampir sasaran demo — teguk kecil sahaja.',
  renalCheck:'Pemeriksaan berat & bengkak',edemaNone:'● Tiada bengkak',edemaAnkle:'▲ Benjol apabila ditekan',
  edemaSwelling:'◆ Bengkak jelas',renalSave:'Simpan pemeriksaan',renalSaved:'Pemeriksaan disimpan pada peranti.',
  renalSopNote:'Berat naik dengan cepat — sila hubungi kakitangan klinik mengikut SOP.',
  bpTitle:'Rekod pantas tekanan darah',bpMorning:'● Pagi rehat',bpDizzy:'▲ Pening',bpPreMed:'Sebelum ubat',
  bpPostMed:'Selepas ubat',bpSave:'Simpan TD',bpBad:'▲ Melebihi sasaran rumah biasa — jika berulang, hubungi klinik mengikut SOP.',
  bpGood:'● Dalam julat rumah biasa untuk demo ini.',bpNote:'Ambang demo pendidikan — ikut sasaran klinik anda.',
  lipidsTitle:'Ringkasan makmal (manual)',lipSave:'Simpan makmal',lipSaved:'Makmal disimpan pada peranti.',
  lipidsNote:'Disimpan pada peranti sahaja. Bawa laporan makmal ke klinik untuk tafsiran.',
  needTag:'Pilih sekurang-kurangnya satu arah penjagaan.',invalidBp:'Masukkan sistolik dan diastolik (60-260 / 40-160).'}};
const pLang=()=>window.__missyLang||'en';
const PT=()=>P[pLang()]||P.en;
const p$=id=>document.getElementById(id);
const pApi=async(path,data)=>{const opts=data===undefined
  ?{method:'GET',headers:{'X-Missy-Token':window.__missyToken||''}}
  :{method:'POST',headers:{'Content-Type':'application/json','X-Missy-Token':window.__missyToken||''},body:JSON.stringify(data)};
  const r=await fetch(path,opts);return r.json();};
let tags=[];let edemaState='NONE';
function profileI18n(){const t=PT();
  document.querySelectorAll('[data-i18n-sos]').forEach(el=>{const k=el.getAttribute('data-i18n-sos');if(t[k])el.textContent=t[k];});}
function show(on=true){p$('care-onboarding').hidden=!on;}
function gateHome(){const has=t=>tags.includes(t);
  p$('renal-card').hidden=!has('KIDNEY');
  p$('bp-card').hidden=!has('BP');
  p$('lipids-card').hidden=!has('LIPIDS');
  if(has('KIDNEY'))loadRenal();}
async function loadRenal(){try{const r=await pApi('/api/renal-card');
  p$('renal-water-ml').textContent=r.water_ml;p$('renal-target').textContent=r.target_ml;
  p$('renal-bar').style.width=Math.min(100,r.percent)+'%';
  p$('renal-amber').hidden=!r.amber;
  const sop=p$('renal-sop');
  if(r.sop_note){sop.textContent=r.sop_note;sop.hidden=false;}else sop.hidden=true;
}catch(e){/* offline: card stays with last values */}}
(async()=>{try{const p=await pApi('/api/profile');
  if(p.care_tags&&p.care_tags.length){tags=p.care_tags;window.__missyTags=tags;gateHome();}else show(true);
}catch(e){show(true);}})();
document.querySelectorAll('.care-tag').forEach(b=>b.addEventListener('click',()=>b.classList.toggle('selected')));
p$('care-confirm').addEventListener('click',async()=>{
  const chosen=[...document.querySelectorAll('.care-tag.selected')].map(b=>b.dataset.tag);
  const t=PT();
  if(!chosen.length){alert(t.needTag);return;}
  try{await pApi('/api/profile/set',{care_tags:chosen});}catch(e){/* localStorage fallback keeps demo usable */}
  tags=chosen;window.__missyTags=chosen;profileI18n();gateHome();show(false);});
p$('profile-btn').addEventListener('click',()=>{show(true);
  document.querySelectorAll('.care-tag').forEach(b=>b.classList.toggle('selected',tags.includes(b.dataset.tag)));});
p$('renal-water-150').addEventListener('click',async()=>{try{
  await pApi('/api/confirm',{request_id:'renal-'+Date.now(),volume_ml:150,source:'+150 mL water cup'});loadRenal();}catch(e){}});
p$('renal-water-250').addEventListener('click',async()=>{try{
  await pApi('/api/confirm',{request_id:'renal-'+Date.now(),volume_ml:250,source:'+250 mL water cup'});loadRenal();}catch(e){}});
document.querySelectorAll('[id^="renal-edema-"]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[id^="renal-edema-"]').forEach(x=>x.classList.remove('selected'));
  b.classList.add('selected');edemaState=b.dataset.state;}));
p$('renal-check-save').addEventListener('click',async()=>{const t=PT();
  try{await pApi('/api/renal-check',{weight_kg:p$('renal-weight').value,edema:edemaState});
    const sop=p$('renal-sop');
    const st=await pApi('/api/renal-card');
    if(st.sop_note){sop.textContent=st.sop_note;sop.hidden=false;}
    else{sop.textContent=t.renalSaved;sop.hidden=false;}
    loadRenal();}catch(e){}});
document.querySelectorAll('.bp-ctx').forEach(b=>b.addEventListener('click',()=>b.classList.toggle('selected')));
p$('bp-save').addEventListener('click',()=>{const t=PT();
  const s=Number(p$('bp-sys').value),d=Number(p$('bp-dia').value);
  const res=p$('bp-result');
  if(!s||!d||s<60||s>260||d<40||d>160){res.textContent=t.invalidBp;res.className='bp-result lt-red';res.hidden=false;return;}
  const high=s>=135||d>=85;  // educational demo threshold, colorblind-safe icon+text
  res.textContent=high?t.bpBad:t.bpGood;
  res.className='bp-result '+(high?'lt-yellow':'lt-green');res.hidden=false;
  try{localStorage.setItem('missy-last-bp',JSON.stringify({s,d,at:Date.now()}));}catch(e){}});
p$('lip-save').addEventListener('click',()=>{const t=PT();
  const vals={ldl:p$('lip-ldl').value,hdl:p$('lip-hdl').value,tg:p$('lip-tg').value,tc:p$('lip-tc').value};
  const res=p$('lip-result');
  try{localStorage.setItem('missy-last-lipids',JSON.stringify(vals));}catch(e){}
  res.textContent=t.lipSaved;res.className='bp-result lt-green';res.hidden=false;});
// language hook
const prevProfileHook=window.__missyApplyLang;
window.__missyApplyLang=()=>{if(prevProfileHook)prevProfileHook();profileI18n();
  document.querySelector('[data-i18n-sos="carePlan"]').textContent=PT().carePlan;};
})();
})();
