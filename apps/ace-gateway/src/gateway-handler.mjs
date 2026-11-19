/**
 * Evaluation pipeline priority (spec.md > 0b) — never bypassed:
 * NO_BASELINE -> AUDIT_INCOMPLETE -> QUEUE_PENDING -> PAIR engine call.
 * AUDIT_INCOMPLETE is globally fail-closed: snapshot output is blocked on ANY
 * audit-write failure path.
 */

export async function evaluateClinicalSnapshot({
  patientAlias,
  baseline,
  current,
  runPairEngine,
  writeAuditLog,
  queueJob,
  pollJobStatus,
  emergencyStderr = (msg) => console.error(msg)
}) {
  // Priority 1: NO_BASELINE check runs before enqueue and before engine call
  if (!baseline) {
    const auditOk = await writeAuditLog({ event_type: "no_baseline", patientAlias });
    if (!auditOk) {
      emergencyStderr(`[AUDIT_WRITE_FAILED] event=no_baseline patient=${patientAlias}`);
      return {
        httpStatus: 500,
        body: { error: "AUDIT_INCOMPLETE" },
        uiAction: "FAIL_CLOSED_BLOCK_SUMMARY"
      };
    }
    return {
      httpStatus: 200,
      body: {
        status: "no_baseline",
        message: "Only one measurement found; trend summary unavailable."
      },
      uiAction: "HIDE_TREND_AND_PROMPT_SEED"
    };
  }

  // Priority 2: queue polling timeout terminal state
  if (pollJobStatus && pollJobStatus.timedOut) {
    const auditOk = await writeAuditLog({
      event_type: "engine_failure",
      cause: "queue_timeout",
      job_id: pollJobStatus.job_id
    });
    if (!auditOk) {
      emergencyStderr(`[AUDIT_WRITE_FAILED] event=queue_timeout job=${pollJobStatus.job_id}`);
      return {
        httpStatus: 500,
        body: { error: "AUDIT_INCOMPLETE" },
        uiAction: "FAIL_CLOSED_BLOCK_SUMMARY"
      };
    }
    return {
      httpStatus: 503,
      body: {
        error: "ENGINE_UNAVAILABLE",
        cause: "queue_timeout",
        message: "Processing timed out. Please contact clinic staff."
      },
      uiAction: "SHOW_UNAVAILABLE_NO_RED_FLAGS"
    };
  }

  // Priority 3: async enqueue branch (only reachable with a baseline present)
  if (queueJob) {
    const job = await queueJob({ patientAlias, current });
    const auditOk = await writeAuditLog({ event_type: "queue_enqueued", job_id: job.job_id });
    if (!auditOk) {
      emergencyStderr(`[AUDIT_WRITE_FAILED] event=queue_enqueued job=${job.job_id}`);
      return {
        httpStatus: 500,
        body: { error: "AUDIT_INCOMPLETE" },
        uiAction: "FAIL_CLOSED_BLOCK_SUMMARY"
      };
    }
    return {
      httpStatus: 202,
      body: { job_id: job.job_id, status: "processing" },
      uiAction: "SHOW_PROCESSING_SPINNER"
    };
  }

  // Priority 4: deterministic PAIR engine call + strict schema validation
  let engineResult;
  try {
    engineResult = await runPairEngine({ baseline, current });
  } catch (err) {
    const auditOk = await writeAuditLog({ event_type: "engine_failure", reason: err.message });
    if (!auditOk) {
      emergencyStderr(`[AUDIT_WRITE_FAILED] event=engine_failure reason=${err.message}`);
      return {
        httpStatus: 500,
        body: { error: "AUDIT_INCOMPLETE" },
        uiAction: "FAIL_CLOSED_BLOCK_SUMMARY"
      };
    }
    return {
      httpStatus: 503,
      body: {
        error: "ENGINE_UNAVAILABLE",
        cause: "subprocess_error",
        message: "Unable to generate summary at this moment. Please contact clinic staff."
      },
      uiAction: "SHOW_UNAVAILABLE_NO_RED_FLAGS"
    };
  }

  // Invalid output schema is distinct: ENGINE_INVALID_OUTPUT -> 503, never defaults
  const isValidSchema =
    engineResult &&
    engineResult.provenance === "pair_deterministic_engine" &&
    typeof engineResult.egfr_current === "number" &&
    Array.isArray(engineResult._safety_flags);

  if (!isValidSchema) {
    const auditOk = await writeAuditLog({
      event_type: "engine_invalid_output",
      cause: "schema_validation_failed"
    });
    if (!auditOk) {
      emergencyStderr(`[AUDIT_WRITE_FAILED] event=engine_invalid_output`);
      return {
        httpStatus: 500,
        body: { error: "AUDIT_INCOMPLETE" },
        uiAction: "FAIL_CLOSED_BLOCK_SUMMARY"
      };
    }
    return {
      httpStatus: 503,
      body: {
        error: "ENGINE_INVALID_OUTPUT",
        cause: "schema_validation_failed",
        message: "Unable to validate clinical output. Please contact clinic staff."
      },
      uiAction: "SHOW_UNAVAILABLE_NO_RED_FLAGS"
    };
  }

  // Priority 5: final fail-closed audit gate before rendering
  const auditSuccess = await writeAuditLog({
    event_type: "snapshot_evaluated",
    patientAlias,
    provenance: engineResult.provenance
  });

  if (!auditSuccess) {
    emergencyStderr(`[AUDIT_WRITE_FAILED] event=snapshot_evaluated patient=${patientAlias}`);
    return {
      httpStatus: 500,
      body: {
        error: "AUDIT_INCOMPLETE",
        message: "Record failed. Please retry or contact clinic staff."
      },
      uiAction: "FAIL_CLOSED_BLOCK_SUMMARY"
    };
  }

  return {
    httpStatus: 200,
    body: {
      status: "ok",
      snapshot: engineResult
    },
    uiAction: "RENDER_CLINICAL_SNAPSHOT"
  };
}
