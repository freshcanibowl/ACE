"""Synthetic-only local renal-care demonstration; no clinical decision making."""
import json, sqlite3, uuid, datetime, re, hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data' / 'demo_case.json'
MAX_ML = 3000

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def demo_plan():
    data = json.loads(DATA.read_text(encoding='utf-8'))
    if data.get('synthetic') is not True or data['plan'].get('clinician_review_status') != 'SYNTHETIC_DEMO_CONFIRMED':
        raise ValueError('DEMO_PLAN_INVALID')
    return data

def connect(db_path):
    conn = sqlite3.connect(str(db_path), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA busy_timeout=10000')
    conn.execute('CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, ml INTEGER NOT NULL, source TEXT NOT NULL, confirmed_at TEXT NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, title TEXT NOT NULL, due_at TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0)')
    conn.execute('CREATE TABLE IF NOT EXISTS sos_incidents (id TEXT PRIMARY KEY, incident_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'ACTIVE\', hypo_cycles INTEGER DEFAULT 0, symptoms_json TEXT, hydration_count INTEGER DEFAULT 0, last_glucose_check TEXT, started_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS safe_menu (id TEXT PRIMARY KEY, label TEXT NOT NULL, source TEXT NOT NULL DEFAULT \'guide\', created_at TEXT NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS app_profile (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    conn.execute('CREATE TABLE IF NOT EXISTS renal_checks (id TEXT PRIMARY KEY, weight_kg REAL, edema TEXT, recorded_at TEXT NOT NULL)')
    conn.commit()
    return conn

def summary(conn):
    plan = demo_plan()
    baseline = sum(x['volume_ml'] for x in plan['observations'] if x.get('confirmed_by_user'))
    added = conn.execute('SELECT COALESCE(SUM(ml),0) FROM observations').fetchone()[0]
    target = plan['plan']['fluid_record_target_ml']
    return {'synthetic': True, 'plan_id':plan['plan']['plan_id'], 'baseline_ml':baseline,
            'added_ml':added, 'recorded_ml':baseline+added, 'target_ml':target,
            'remaining_record_target_ml':max(0,target-baseline-added),
            'above_record_target_ml':max(0,baseline+added-target),
            'disclaimer':'Synthetic record target only, not medical advice. Unrecorded beverages, soup and food fluids may be missing.'}

def validate_extraction(obj):
    if not isinstance(obj,dict) or set(obj) != {'action','volume_ml','unit','confidence'}:
        raise ValueError('INVALID_MODEL_SCHEMA')
    if obj['action'] != 'LOG_FLUID' or obj['unit'] != 'ml':
        raise ValueError('UNSUPPORTED_ACTION_OR_UNIT')
    ml=obj['volume_ml']
    if isinstance(ml,bool) or not isinstance(ml,int) or not 1<=ml<=MAX_ML:
        raise ValueError('INVALID_VOLUME')
    if isinstance(obj['confidence'],bool) or not isinstance(obj['confidence'],(float,int)) or not 0<=obj['confidence']<=1:
        raise ValueError('INVALID_CONFIDENCE')
    if obj['confidence']<0.8:
        raise ValueError('LOW_CONFIDENCE')
    return ml


def validate_qvac_envelope(obj):
    """Fail closed if a subprocess response does not carry the expected QVAC contract.

    This is an application integrity check, not cryptographic proof of a genuine SDK call.
    """
    if not isinstance(obj,dict) or obj.get('engine') != 'QVAC_LOCAL':
        raise ValueError('QVAC_ENGINE_NOT_VERIFIED')
    if obj.get('model') != 'LLAMA_3_2_1B_INST_Q4_0':
        raise ValueError('QVAC_MODEL_NOT_VERIFIED')
    if type(obj.get('latency_ms')) is not int or obj['latency_ms'] < 0:
        raise ValueError('QVAC_LATENCY_INVALID')
    if obj.get('stop_reason') in ('error','cancelled','length'):
        raise ValueError('QVAC_GENERATION_INCOMPLETE')
    return validate_extraction(obj.get('parsed'))

def verify_original_text(text, ml):
    # Model cannot hallucinate an explicit quantity that the patient did not say.
    if not isinstance(text,str) or len(text)>240:
        raise ValueError('INVALID_INPUT')
    # Reject negated/cancelled or instruction-like inputs; do not record a denied action.
    if re.search(r'\b(?:do not|don\'t|did not|didn\'t|never|cancel|ignore|instead of|not log)\b|(?:不要|别记录|別記錄|取消|没喝|沒喝|不记录|不記錄)',text,re.I):
        raise ValueError('NEGATED_OR_CANCELLED_LOG')
    # Build 08: avoid recording hypothetical, historical, spilled or questioned volumes
    # as today's consumed fluid. This is intentionally conservative; ask for a new
    # explicit log instead of guessing a time or consumption event.
    if re.search(
        r'\b(?:yesterday|tomorrow|last night|last week|next week|later|'
        r'will drink|going to drink|plan to|planning to|might drink|'
        r'spilled|spilt|poured out|discarded|did not consume|'
        r'have not drunk|haven.t drunk|should i|can i|how much|if i)\b'
        r'|(?:昨天|昨日|明天|下周|下週|打算|准备喝|準備喝|将要喝|將要喝|没喝|沒喝|洒了|灑了|倒掉|如果|可以喝吗|能喝吗|多少)',
        text, re.I):
        raise ValueError('NON_CURRENT_OR_HYPOTHETICAL_LOG')
    if '?' in text or '？' in text:
        raise ValueError('QUESTION_NOT_LOG')
    if not re.search(r'\b(?:log|record|add|track|drank|drink|consumed|had)\b|(?:记录|記錄|记下|記下|喝了|饮用|飲用)', text, re.I):
        raise ValueError('EXPLICIT_LOG_OR_CONSUMPTION_REQUIRED')
    # Strict MVP supports explicit ml or mL or 毫升; no implicit cups or servings.
    matches=re.findall(r'(?<!\d)(\d{1,4})\s*(?:ml|毫升)(?![a-z])',text,re.I)
    if len(matches)!=1 or int(matches[0])!=ml:
        raise ValueError('INPUT_QUANTITY_NOT_VERIFIED')
    if not re.search(r'(水|饮|喝|记录|記|log|water|fluid|drink)',text,re.I):
        raise ValueError('NOT_FLUID_OBSERVATION')
    return True

def confirm(conn, ml, source, request_id):
    if isinstance(ml,bool) or not isinstance(ml,int) or not 1<=ml<=MAX_ML:
        raise ValueError('INVALID_VOLUME')
    if not isinstance(source,str) or not 1<=len(source)<=240:
        raise ValueError('INVALID_SOURCE')
    try: uuid.UUID(request_id)
    except (TypeError,ValueError,AttributeError): raise ValueError('INVALID_REQUEST_ID')
    with conn:
        cur=conn.execute('INSERT OR IGNORE INTO observations (id,ml,source,confirmed_at) VALUES (?,?,?,?)', (request_id,ml,source,utcnow()))
    if cur.rowcount==0:
        raise ValueError('REPLAY_REJECTED')
    return {'event_id':request_id, 'persisted':True, 'summary':summary(conn)}

def food_lookup(name):
    # Explicitly no numeric potassium/phosphorus guesses or safe/unsafe categorization.
    catalog={'banana':{'name':'Banana / 香蕉','source':'Demo food index; nutrient values intentionally absent'},
             '香蕉':{'name':'Banana / 香蕉','source':'Demo food index; nutrient values intentionally absent'},
             'rice':{'name':'Rice / 米饭','source':'Demo food index; nutrient values intentionally absent'},
             '米饭':{'name':'Rice / 米饭','source':'Demo food index; nutrient values intentionally absent'}}
    item=catalog.get(str(name).strip().lower())
    if not item:
        return {'status':'INSUFFICIENT_DATA','message':'Food or preparation not found in the local demo index. Ask a renal dietitian for individual guidance.'}
    return {'status':'INSUFFICIENT_DATA','food':item['name'],'source':item['source'],
            'message':'This offline demo has no verified nutrient amount or individual potassium allowance. It cannot determine a safe portion.'}

def add_reminder(conn,title,due_at):
    if not isinstance(title,str) or not 1<=len(title)<=80:
        raise ValueError('INVALID_REMINDER_TITLE')
    try: due=datetime.datetime.fromisoformat(due_at.replace('Z','+00:00'))
    except (ValueError,AttributeError): raise ValueError('INVALID_REMINDER_DATE')
    if due.tzinfo is None: raise ValueError('TIMEZONE_REQUIRED')
    if not datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(minutes=1) <= due <= datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=2):
        raise ValueError('REMINDER_TIME_OUT_OF_RANGE')
    id=str(uuid.uuid4())
    with conn:conn.execute('INSERT INTO reminders(id,title,due_at) VALUES(?,?,?)',(id,title,due.isoformat()))
    return {'id':id,'title':title,'due_at':due.isoformat()}

def reminders(conn):
    return [dict(row) for row in conn.execute('SELECT id,title,due_at,acknowledged FROM reminders ORDER BY due_at')]

def acknowledge(conn, id):
    with conn: n=conn.execute('UPDATE reminders SET acknowledged=1 WHERE id=? AND acknowledged=0',(id,)).rowcount
    if n!=1: raise ValueError('REMINDER_NOT_PENDING')
    return {'acknowledged':True,'id':id}

# ---------------------------------------------------------------------------
# SOS incident center — deterministic red-line state machine (round 2).
# All thresholds and transitions are hard-coded here; the browser can never
# set status=SOP_CONTACT by itself. Safety copy lives server-side, trilingual,
# and must pass the banned-word test (no 紧急/高风险/诊断/alarmist terms).
# ---------------------------------------------------------------------------

SOS_TYPES=('HYPOGLYCEMIA','SICK_DAY')
SOS_SYMPTOM_CODES=('FEVER','VOMITING','DIARRHEA','CANT_DRINK','RAPID_BREATHING','FRUITY_BREATH','CONFUSION')
# Red-line symptom combos: any of these fires the clinic-SOP contact card.
SOS_REDLINE_COMBOS=(
    frozenset(('VOMITING','CANT_DRINK')),
    frozenset(('RAPID_BREATHING',)),
    frozenset(('FRUITY_BREATH',)),
    frozenset(('CONFUSION',)),
)
SOS_HYPO_CYCLES_REDLINE=2          # two "still low" 15-15 cycles -> SOP contact

SOS_COPY={
 'en':{'sop_line':'Threshold detected per clinic SOP. Please contact clinic staff.',
       'demo_phone':'Demo placeholder — insert your clinic number here.',
       'step1':'Eat 15 g of fast sugar now (3-4 glucose tablets or 150 ml juice).',
       'step2':'Sit still for 15 minutes. Recheck when the timer ends.',
       'still_low':'Still low — repeat the 15-15 cycle.',
       'back_normal':'Back to normal — incident saved.'},
 'zh':{'sop_line':'检测到需按诊所 SOP 联系医护人员的阈值，请联系诊所工作人员。',
       'demo_phone':'演示占位——请在此填入您的诊所电话。',
       'step1':'立刻吃 15 克快升糖食物（3-4 颗葡萄糖片或 150 毫升果汁）。',
       'step2':'静坐等待 15 分钟，计时结束后复测。',
       'still_low':'仍然偏低——重复 15-15 流程。',
       'back_normal':'已恢复正常——事件已保存。'},
 'ms':{'sop_line':'Ambang dikesan mengikut SOP klinik. Sila hubungi kakitangan klinik.',
       'demo_phone':'Demo — sila masukkan nombor klinik anda di sini.',
       'step1':'Ambil 15 g gula pantas sekarang (3-4 tablet glukosa atau 150 ml jus).',
       'step2':'Duduk diam 15 minit. Semak semula selepas pemasa tamat.',
       'still_low':'Masih rendah — ulang kitaran 15-15.',
       'back_normal':'Kembali normal — insiden disimpan.'}}

def _sos_validate_type(t):
    if t not in SOS_TYPES: raise ValueError('INVALID_SOS_TYPE')

def _sos_validate_symptoms(symptoms):
    if not isinstance(symptoms,list) or any(s not in SOS_SYMPTOM_CODES for s in symptoms):
        raise ValueError('INVALID_SYMPTOM_CODE')
    return list(dict.fromkeys(symptoms))

def _sos_redline(hypo_cycles, symptoms):
    syms=set(symptoms or [])
    return hypo_cycles>=SOS_HYPO_CYCLES_REDLINE or any(combo<=syms for combo in SOS_REDLINE_COMBOS)

def _sos_copy(lang):
    return SOS_COPY.get(lang, SOS_COPY['en'])

def sos_start(conn, incident_type, lang='en'):
    _sos_validate_type(incident_type)
    id=str(uuid.uuid4()); now=utcnow()
    with conn: conn.execute('INSERT INTO sos_incidents(id,incident_type,status,started_at,updated_at) VALUES(?,?,?,?,?)',
                            (id,incident_type,'ACTIVE',now,now))
    return _sos_view(conn, id, lang)

def sos_update(conn, id, lang='en', hypo_cycles=None, symptoms=None, hydration_count=None, glucose_check=None):
    row=conn.execute('SELECT * FROM sos_incidents WHERE id=?',(id,)).fetchone()
    if row is None: raise ValueError('SOS_INCIDENT_NOT_FOUND')
    incident=dict(row)
    if incident['status']!='ACTIVE': raise ValueError('SOS_INCIDENT_CLOSED')
    sets=[]
    if hypo_cycles is not None:
        if not isinstance(hypo_cycles,int) or not 0<=hypo_cycles<=10: raise ValueError('INVALID_HYPO_CYCLES')
        sets.append(('hypo_cycles',hypo_cycles))
    if symptoms is not None:
        symptoms=_sos_validate_symptoms(symptoms)
        sets.append(('symptoms_json',json.dumps(symptoms)))
    if hydration_count is not None:
        if not isinstance(hydration_count,int) or not 0<=hydration_count<=50: raise ValueError('INVALID_HYDRATION_COUNT')
        sets.append(('hydration_count',hydration_count))
    if glucose_check is not None:
        try: datetime.datetime.fromisoformat(str(glucose_check).replace('Z','+00:00'))
        except (ValueError,AttributeError): raise ValueError('INVALID_GLUCOSE_CHECK_TIME')
        sets.append(('last_glucose_check',str(glucose_check)))
    new_cycles=hypo_cycles if hypo_cycles is not None else incident['hypo_cycles']
    new_symptoms=json.loads(incident['symptoms_json']) if incident['symptoms_json'] else []
    if symptoms is not None: new_symptoms=symptoms
    status='SOP_CONTACT' if _sos_redline(new_cycles,new_symptoms) else 'ACTIVE'
    sets.append(('status',status)); sets.append(('updated_at',utcnow()))
    with conn:
        for k,v in sets: conn.execute(f'UPDATE sos_incidents SET {k}=? WHERE id=?',(v,id))
    return _sos_view(conn, id, lang)

def sos_resolve(conn, id, lang='en'):
    row=conn.execute('SELECT status FROM sos_incidents WHERE id=?',(id,)).fetchone()
    if row is None: raise ValueError('SOS_INCIDENT_NOT_FOUND')
    if row['status']=='SOP_CONTACT':
        # SOP-contacted incidents stay SOP_CONTACT on reopen — never silently reset.
        return _sos_view(conn, id, lang)
    with conn: conn.execute("UPDATE sos_incidents SET status='RESOLVED', updated_at=? WHERE id=?",(utcnow(),id))
    return _sos_view(conn, id, lang)

def _sos_view(conn, id, lang='en'):
    row=conn.execute('SELECT * FROM sos_incidents WHERE id=?',(id,)).fetchone()
    if row is None: raise ValueError('SOS_INCIDENT_NOT_FOUND')
    d=dict(row)
    d['symptoms']=json.loads(d.pop('symptoms_json')) if d['symptoms_json'] else []
    d.pop('symptoms_json',None)
    copy=_sos_copy(lang)
    d['sop_card']={'line':copy['sop_line'],'phone':copy['demo_phone'],'demo':True}
    d['steps']=[copy['step1'],copy['step2']]
    return d

def sos_history(conn, lang='en'):
    return [_sos_view(conn, r['id'], lang)
            for r in conn.execute('SELECT id FROM sos_incidents ORDER BY started_at DESC LIMIT 20')]

def safe_menu_add(conn, label):
    if not isinstance(label,str) or not 1<=len(label)<=160: raise ValueError('INVALID_MENU_LABEL')
    id=str(uuid.uuid4())
    with conn: conn.execute('INSERT INTO safe_menu(id,label,created_at) VALUES(?,?,?)',(id,label,utcnow()))
    return {'id':id,'label':label}

def safe_menu_list(conn):
    return [dict(r) for r in conn.execute('SELECT id,label,created_at FROM safe_menu ORDER BY created_at DESC')]

def weekly_ring(conn):
    """Days-with-logs out of the last 7 (device-local dates). Proxy metric for the
    POC — labeled demo scope in the UI. Non-punitive framing: no failure states."""
    rows=conn.execute('SELECT DISTINCT substr(confirmed_at,1,10) AS day FROM observations').fetchall()
    logged={r['day'] for r in rows}
    today=datetime.datetime.now().date()
    days=[(today-datetime.timedelta(days=i)).isoformat() for i in range(7)]
    hit=sum(1 for d in days if d in logged)
    # quiet spell: no logs at all in the last 3 days
    quiet=not any(d in logged for d in days[:3])
    return {'days_logged':hit,'window_days':7,'percent':round(hit/7*100),
            'badge':hit/7>=0.8,'quiet_spell':quiet}

EDU_LABEL='patient_education_not_personalised_advice'


# ---------------------------------------------------------------------------
# Care-direction profiles (round 2 revision): kidney / glucose / bp / lipids.
# Tags gate which home cards render. Persisted in Missy SQLite; echoed to all
# clients. At least one tag required.
# ---------------------------------------------------------------------------
CARE_TAGS = ('KIDNEY', 'GLUCOSE', 'BP', 'LIPIDS')
RENAL_WATER_TARGET_ML = 1000   # demo recording target from Build 08 plan, not medical advice
RENAL_WATER_AMBER_PCT = 90     # amber cup at >=90% of demo target
RENAL_WEIGHT_RISE_KG = 2.0     # 3-day rise threshold for SOP-worded note (educational)

def _profile_validate(tags):
    if not isinstance(tags, list) or not tags:
        raise ValueError('AT_LEAST_ONE_CARE_TAG_REQUIRED')
    clean = list(dict.fromkeys(str(t).upper() for t in tags))
    for t in clean:
        if t not in CARE_TAGS:
            raise ValueError('INVALID_CARE_TAG:' + t)
    return clean

def profile_get(conn):
    row = conn.execute("SELECT value FROM app_profile WHERE key='care_tags'").fetchone()
    return {'care_tags': row[0].split(',') if row else []}

def profile_set(conn, tags):
    clean = _profile_validate(tags)
    with conn:
        conn.execute("INSERT INTO app_profile(key,value) VALUES('care_tags',?) "
                     "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (','.join(clean),))
    return {'care_tags': clean}

def renal_card_state(conn):
    """Kidney-tag card: water cup + weight/edema self-check. Deterministic,
    demo-target framing, SOP wording on red flags."""
    now = utcnow()
    today = now[:10]
    row = conn.execute("SELECT COALESCE(SUM(ml),0) FROM observations "
                       "WHERE confirmed_at>=?", (today,)).fetchone()
    water = row[0] or 0
    pct = min(100, round(water / RENAL_WATER_TARGET_ML * 100))
    amber = pct >= RENAL_WATER_AMBER_PCT
    weights = conn.execute("SELECT weight_kg, edema, recorded_at FROM renal_checks "
                           "ORDER BY recorded_at DESC LIMIT 3").fetchall()
    latest = dict(weights[0]) if weights else None
    note = None
    if latest and len(weights) >= 2:
        try:
            older = float(weights[-1]['weight_kg'] or 0)
            newer = float(latest['weight_kg'] or 0)
            if newer - older >= RENAL_WEIGHT_RISE_KG:
                note = _sos_copy('en')['sop_line']  # clinic-SOP wording, single source
        except (TypeError, ValueError):
            pass
    return {'water_ml': water, 'target_ml': RENAL_WATER_TARGET_ML, 'percent': pct,
            'amber': amber, 'latest_check': latest, 'sop_note': note}

def renal_check_add(conn, weight_kg, edema):
    """Record a weight/edema self-check. edema: NONE | ANKLE_DENT | SWELLING."""
    if edema not in ('NONE', 'ANKLE_DENT', 'SWELLING'):
        raise ValueError('INVALID_EDEMA_STATE')
    try:
        w = float(weight_kg)
        if not 20 <= w <= 300:
            raise ValueError
    except (TypeError, ValueError):
        raise ValueError('INVALID_WEIGHT')
    rid = str(uuid.uuid4())
    with conn:
        conn.execute('INSERT INTO renal_checks(id,weight_kg,edema,recorded_at) VALUES(?,?,?,?)',
                     (rid, w, edema, utcnow()))
    return {'id': rid, 'weight_kg': w, 'edema': edema}

def eatout_guide():
    """Curated patient-education content (handbook module 1), static and offline.
    Every entry carries the education label; swaps are actions, not prescriptions."""
    def dish(name_en,name_zh,name_ms,light,swaps):
        return {'name':{'en':name_en,'zh':name_zh,'ms':name_ms},'traffic_light':light,
                'swaps':swaps,'content_type':EDU_LABEL}
    scenes=[
      {'scene':'nasi_campur','name':{'en':'Mixed rice / 杂菜饭','zh':'杂菜饭','ms':'Nasi campur'},'dishes':[
        dish('Steamed egg','蒸水蛋','Telur kukus','GREEN',['Eat it first — gentle protein before rice.']),
        dish('Plain steamed chicken (no skin)','白斩鸡去皮','Ayam putih tanpa kulit','GREEN',['Remove the skin; keep the sauce light.']),
        dish('Curry chicken with gravy','咖喱鸡配汁','Ayam kari berkuah','YELLOW',['Spoon the gravy off; let the chicken drain before eating.']),
        dish('Sweet-sour ribs','糖醋排骨','Ikan/paikam dgn sos manis','RED',['Sauce is heavy in sugar and oil — choose steamed or plain-cooked instead.']),
        dish('White rice with sauce','白米饭淋汁','Nasi putih berkuah','RED',['Scoop out about 1/3 of the rice; keep gravy off.'])]},
      {'scene':'kopitiam','name':{'en':'Kopitiam / 茶餐厅','zh':'茶餐厅','ms':'Kopitiam'},'dishes':[
        dish('Kopi-O Kosong (no sugar)','无糖黑咖啡','Kopi-O kosong','GREEN',['Already the low-sugar choice — keep it.']),
        dish('Half-boiled eggs + wholemeal toast (light kaya)','半熟蛋+全麦面包少抹咖椰','Telur separuh masak + roti wholemeal','GREEN',['Ask for less kaya/butter.']),
        dish('Teh Tarik','拉茶','Teh tarik','RED',['Ask for Teh C Kosong (no sugar) instead.']),
        dish('Char Kway Teow','炒粿条','Kuey teow goreng','RED',['High oil and carbs — choose clear-soup noodle soup instead.'])]},
      {'scene':'fast_food','name':{'en':'Fast food / 快餐','zh':'快餐','ms':'Makanan segera'},'dishes':[
        dish('Grilled chicken burger (no top bun)','烤鸡腿堡去上盖','Burger ayam bakar','YELLOW',['Remove the top bun; skip the fries.']),
        dish('French fries','炸薯条','Kentang goreng','RED',['Swap for a side salad, dressing separate.']),
        dish('Sugar-sweetened soda','含糖汽水','Air bergula','RED',['Zero-sugar version or unsweetened green tea.']),
        dish('Cream soup','奶油浓汤','Sup krim','RED',['Broth-based soup is lighter.'])]}]
    return {'content_type':EDU_LABEL,'scenes':scenes,
            'notice':'Curated patient-education content, not personalised medical advice.'}
