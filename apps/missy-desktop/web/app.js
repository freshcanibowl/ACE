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
function startSick(){show('sos-sick-flow',true);renderSymptoms();
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
// language hook — main I18N switch calls window.__missyApplyLang()
window.__missyApplyLang=()=>{t$('sos-title').textContent=T().title;
  document.querySelectorAll('[data-i18n-sos]').forEach(el=>{const k=el.getAttribute('data-i18n-sos');if(T()[k])el.textContent=T()[k];});
  if(!t$('sos-takeover').hidden){
    if(!t$('sos-hypo-flow').hidden&&t$('sos-steps').children.length===2){
      t$('sos-steps').replaceChildren(...[T().step1,T().step2].map(s=>{const li=document.createElement('li');li.textContent=s;return li;}));}
    if(!t$('sos-sick-flow').hidden)renderSymptoms();}};
})();
