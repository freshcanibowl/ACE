/**
 * POC known-limitation notes:
 * 1. Keyword "air" (Malay for "water") collides with English "air" in cross-language
 *    contexts; rule-based parsing is a POC-only restriction.
 * 2. Negation parsing handles single-symptom short sentences only — no multi-symptom
 *    compound sentences (e.g. "没有水肿 but short of breath").
 * Unit safety: missing or conflicting units are never silently guessed —
 * NEEDS_CONFIRMATION is returned with a specific reason instead.
 */

export const SAFETY_COPY_I18N = {
  NOT_A_DOCTOR: {
    en: "This tool does not replace professional medical advice.",
    zh: "本工具不替代医生专业建议。",
    ms: "Alat ini tidak menggantikan nasihat perubatan profesional."
  },
  CONTACT_CLINIC: {
    en: "Threshold detected per clinic SOP. Please contact clinic staff.",
    zh: "检测到需按诊所 SOP 联系医护人员的阈值，请联系诊所工作人员。",
    ms: "Ambang dikesan mengikut SOP klinik. Sila hubungi kakitangan klinik."
  },
  AUDIT_FAILED: {
    en: "Record failed. Please retry or contact clinic staff.",
    zh: "记录失败，请重试或联系诊所工作人员。",
    ms: "Rekod gagal. Sila cuba lagi atau hubungi kakitangan klinik."
  }
};

const CONFIRMATION_SHELL = {
  status: "NEEDS_CONFIRMATION",
  normalized_value: null,
  unit: null,
  original_unit: null,
  unit_source: "missing",
  conversion: null
};

export function normalizePatientInput(rawText) {
  const text = String(rawText || "").trim();

  // 1. Negation interception (single-symptom short sentences)
  if (/(没有|无|no|not|tiada|tidak)\s*(水肿|edema|bengkak)/i.test(text)) {
    return {
      status: "CONFIRMED",
      metric: "edema",
      raw_text: text,
      normalized_value: false,
      unit: "boolean",
      original_unit: "boolean",
      unit_source: "fixed_standard",
      conversion: null
    };
  }

  // 2. Uncertainty interception
  if (/(可能|大概|好像|maybe|probably|mungkin|agak)/i.test(text)) {
    return {
      ...CONFIRMATION_SHELL,
      reason: "UNCERTAIN_EXPRESSION",
      raw_text: text,
      safety_notice: SAFETY_COPY_I18N.NOT_A_DOCTOR
    };
  }

  // 3. eGFR fixed standard unit
  const egfrMatch = text.match(/\begfr\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (egfrMatch) {
    return {
      status: "CONFIRMED",
      metric: "egfr",
      raw_text: text,
      normalized_value: parseFloat(egfrMatch[1]),
      unit: "mL/min/1.73m2",
      original_unit: "mL/min/1.73m2",
      unit_source: "fixed_standard",
      conversion: null
    };
  }

  // 4. Fluid intake (zh/en/ms mixed)
  const fluidMatch = text.match(/(?:喝水|饮水|水|water|fluid|minum\s*air|air)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(ml|l)?/i);
  if (fluidMatch) {
    const val = parseFloat(fluidMatch[1]);
    const unitRaw = fluidMatch[2];
    if (!unitRaw) {
      return {
        ...CONFIRMATION_SHELL,
        reason: "MISSING_UNIT",
        raw_text: text
      };
    }
    const isLiter = unitRaw.toLowerCase() === "l";
    return {
      status: "CONFIRMED",
      metric: "fluid_intake",
      raw_text: text,
      normalized_value: isLiter ? val * 1000 : val,
      unit: "ml",
      original_unit: unitRaw,
      unit_source: "explicit",
      conversion: isLiter ? { from: unitRaw, to: "ml", factor: 1000 } : null
    };
  }

  // 5. Serum creatinine dual-unit strict separation (unit-conflict detection + explicit conversion provenance)
  if (/(?:scr|肌酐|creatinine)/i.test(text)) {
    const unitMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(mg\/dl|umol\/l|µmol\/l)/gi)];
    if (unitMatches.length > 1) {
      return {
        ...CONFIRMATION_SHELL,
        reason: "UNIT_CONFLICT",
        raw_text: text,
        unit_source: "conflict"
      };
    }

    const scrSingleMatch = text.match(/(?:scr|肌酐|creatinine)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|umol\/l|µmol\/l)?/i);
    if (scrSingleMatch) {
      const val = parseFloat(scrSingleMatch[1]);
      const unitRaw = scrSingleMatch[2];
      if (!unitRaw) {
        return {
          ...CONFIRMATION_SHELL,
          reason: "MISSING_UNIT_SCR",
          raw_text: text
        };
      }
      const isMgDl = unitRaw.toLowerCase() === "mg/dl";
      return {
        status: "CONFIRMED",
        metric: "serum_creatinine",
        raw_text: text,
        normalized_value: isMgDl ? Number((val * 88.4).toFixed(1)) : val,
        unit: "umol/L",
        original_unit: unitRaw,
        unit_source: "explicit",
        conversion: isMgDl ? { from: unitRaw, to: "umol/L", factor: 88.4 } : null
      };
    }
  }

  return {
    ...CONFIRMATION_SHELL,
    reason: "UNRECOGNIZED_INPUT",
    raw_text: text
  };
}
