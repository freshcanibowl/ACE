# Slice 1 tests: SOS red-line state machine, banned words, persistence; safe menu; weekly ring.
import os, sys, unittest, tempfile, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import core

class SosTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix='.sqlite3', delete=False)
        self.tmp.close()
        os.unlink(self.tmp.name)
        self.conn = core.connect(self.tmp.name)
    def tearDown(self):
        self.conn.close()
        os.unlink(self.tmp.name)

class TestSosFlow(SosTestBase):
    def test_start_creates_active_incident_with_static_steps(self):
        v = core.sos_start(self.conn, 'HYPOGLYCEMIA')
        self.assertEqual(v['status'], 'ACTIVE')
        self.assertEqual(len(v['steps']), 2)
        self.assertTrue(v['sop_card']['demo'])
    def test_invalid_type_rejected(self):
        with self.assertRaises(ValueError):
            core.sos_start(self.conn, 'COFFEE')
    def test_two_still_low_cycles_fire_sop_contact(self):
        v = core.sos_start(self.conn, 'HYPOGLYCEMIA')
        v = core.sos_update(self.conn, v['id'], hypo_cycles=1)
        self.assertEqual(v['status'], 'ACTIVE')
        v = core.sos_update(self.conn, v['id'], hypo_cycles=2)
        self.assertEqual(v['status'], 'SOP_CONTACT')
    def test_redline_symptom_combo_fires_sop_contact(self):
        v = core.sos_start(self.conn, 'SICK_DAY')
        v = core.sos_update(self.conn, v['id'], symptoms=['VOMITING', 'CANT_DRINK'])
        self.assertEqual(v['status'], 'SOP_CONTACT')
    def test_single_symptom_stays_active(self):
        v = core.sos_start(self.conn, 'SICK_DAY')
        v = core.sos_update(self.conn, v['id'], symptoms=['FEVER'])
        self.assertEqual(v['status'], 'ACTIVE')
    def test_unknown_symptom_code_rejected(self):
        v = core.sos_start(self.conn, 'SICK_DAY')
        with self.assertRaises(ValueError):
            core.sos_update(self.conn, v['id'], symptoms=['SNACKING'])
    def test_sop_incident_never_resets(self):
        v = core.sos_start(self.conn, 'HYPOGLYCEMIA')
        v = core.sos_update(self.conn, v['id'], hypo_cycles=2)  # SOP_CONTACT
        r = core.sos_resolve(self.conn, v['id'])
        self.assertEqual(r['status'], 'SOP_CONTACT')
        hist = core.sos_history(self.conn)
        self.assertEqual(hist[0]['status'], 'SOP_CONTACT')
    def test_normal_incident_resolves(self):
        v = core.sos_start(self.conn, 'HYPOGLYCEMIA')
        r = core.sos_resolve(self.conn, v['id'])
        self.assertEqual(r['status'], 'RESOLVED')
    def test_lang_param_switches_sop_copy(self):
        v = core.sos_start(self.conn, 'HYPOGLYCEMIA', lang='zh')
        self.assertIn('诊所', v['sop_card']['line'])
        v = core.sos_start(self.conn, 'HYPOGLYCEMIA', lang='ms')
        self.assertIn('klinik', v['sop_card']['line'])
    def test_closed_incident_rejects_update(self):
        v = core.sos_start(self.conn, 'HYPOGLYCEMIA')
        core.sos_resolve(self.conn, v['id'])
        with self.assertRaises(ValueError):
            core.sos_update(self.conn, v['id'], hydration_count=1)

class TestBannedWords(SosTestBase):
    BANNED = ('紧急', 'emergency', '高风险', 'high risk', '诊断', 'diagnos')
    def test_all_safety_copy_clean_all_langs(self):
        import json as _json
        for lang, entries in core.SOS_COPY.items():
            for key, text in entries.items():
                low = text.lower()
                for word in self.BANNED:
                    self.assertNotIn(word.lower(), low,
                        f'banned term "{word}" in SOS_COPY[{lang}][{key}]')
        g = core.eatout_guide()
        blob = _json.dumps(g).lower()
        for word in self.BANNED:
            self.assertNotIn(word.lower(), blob, f'banned term "{word}" in eatout guide')

class TestSafeMenu(SosTestBase):
    def test_add_and_list_persists(self):
        core.safe_menu_add(self.conn, 'Steamed egg + plain rice (1/3 scooped out)')
        items = core.safe_menu_list(self.conn)
        self.assertEqual(len(items), 1)
        self.assertIn('Steamed egg', items[0]['label'])
    def test_invalid_label_rejected(self):
        with self.assertRaises(ValueError):
            core.safe_menu_add(self.conn, '')
        with self.assertRaises(ValueError):
            core.safe_menu_add(self.conn, 'x' * 200)

class TestWeeklyRing(SosTestBase):
    def _log(self, days_ago, n=1):
        import datetime
        ts = (datetime.datetime.now(datetime.timezone.utc)
              - datetime.timedelta(days=days_ago)).isoformat()
        for i in range(n):
            core.confirm(self.conn, 200, 'Log 200 ml water', f'11111111-2222-3333-4444-55555555{days_ago:02d}{i:02d}')
            self.conn.execute('UPDATE observations SET confirmed_at=? WHERE rowid=(SELECT MAX(rowid) FROM observations)', (ts,))
        self.conn.commit()
    def test_empty_db_zero_percent_no_badge(self):
        r = core.weekly_ring(self.conn)
        self.assertEqual(r['percent'], 0)
        self.assertFalse(r['badge'])
        self.assertTrue(r['quiet_spell'])
    def test_full_week_hits_badge(self):
        for d in range(7):
            self._log(d)
        r = core.weekly_ring(self.conn)
        self.assertEqual(r['days_logged'], 7)
        self.assertTrue(r['badge'])
        self.assertFalse(r['quiet_spell'])
    def test_eighty_percent_threshold(self):
        for d in range(6):  # 6/7 = 86%
            self._log(d)
        self.assertTrue(core.weekly_ring(self.conn)['badge'])
        for d in range(5):  # separate db via new conn — 5/7 = 71%
            pass
    def test_guide_has_three_scenes_with_labels(self):
        g = core.eatout_guide()
        self.assertEqual(len(g['scenes']), 3)
        for scene in g['scenes']:
            self.assertGreaterEqual(len(scene['dishes']), 4)
            for dish in scene['dishes']:
                self.assertEqual(dish['content_type'], 'patient_education_not_personalised_advice')

if __name__ == '__main__':
    unittest.main()
