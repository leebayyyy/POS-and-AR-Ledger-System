<?php
require_once "auth-lib.php";
  header('Content-Type: application/json');
  header("Access-Control-Allow-Origin: *");

  function getOverduePolicySettings($conn) {
    $policy = [
      "default_term_days" => 30,
      "interest_mode" => "fixed",
      "interest_rate_pct" => 5.00,
      "penalty_mode" => "flat",
      "penalty_value" => 50.00,
      "block_overdue_accounts" => 1
    ];
    try {
      $stmt = $conn->query(
        "SELECT setting_key, setting_value FROM tblsystem_settings
         WHERE setting_key IN ('ar_default_term_days', 'ar_interest_mode', 'ar_interest_rate_pct', 'ar_penalty_mode', 'ar_penalty_value', 'ar_block_overdue_accounts')"
      );
      if ($stmt) {
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
          $k = $row['setting_key'];
          $v = trim((string)$row['setting_value']);
          if ($k === 'ar_default_term_days' && is_numeric($v) && (int)$v >= 1) {
            $policy['default_term_days'] = (int)$v;
          } elseif ($k === 'ar_interest_mode' && in_array(strtolower($v), ['fixed', 'compounding'], true)) {
            $policy['interest_mode'] = strtolower($v);
          } elseif ($k === 'ar_interest_rate_pct' && is_numeric($v) && (float)$v >= 0) {
            $policy['interest_rate_pct'] = round((float)$v, 2);
          } elseif ($k === 'ar_penalty_mode' && in_array(strtolower($v), ['flat', 'percent', 'none'], true)) {
            $policy['penalty_mode'] = strtolower($v);
          } elseif ($k === 'ar_penalty_value' && is_numeric($v) && (float)$v >= 0) {
            $policy['penalty_value'] = round((float)$v, 2);
          } elseif ($k === 'ar_block_overdue_accounts') {
            $policy['block_overdue_accounts'] = in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true) ? 1 : 0;
          }
        }
      }
    } catch (Throwable $e) {
      // Fallback to defaults
    }
    return $policy;
  }

  function saveOverduePolicy($json) {
    include "connection-pdo.php";
    $data = json_decode($json, true) ?: [];
    $current = getOverduePolicySettings($conn);

    $termDays = isset($data['default_term_days']) ? (int)$data['default_term_days'] : $current['default_term_days'];
    if ($termDays < 1 || $termDays > 3650) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Default term days must be between 1 and 3650."]);
    }

    $interestMode = isset($data['interest_mode']) ? strtolower(trim((string)$data['interest_mode'])) : $current['interest_mode'];
    if (!in_array($interestMode, ['fixed', 'compounding'], true)) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Interest mode must be 'fixed' or 'compounding'."]);
    }

    $interestRate = isset($data['interest_rate_pct']) ? round((float)$data['interest_rate_pct'], 2) : $current['interest_rate_pct'];
    if ($interestRate < 0 || $interestRate > 100) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Interest rate percentage must be between 0 and 100."]);
    }

    $penaltyMode = isset($data['penalty_mode']) ? strtolower(trim((string)$data['penalty_mode'])) : $current['penalty_mode'];
    if (!in_array($penaltyMode, ['flat', 'percent', 'none'], true)) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Penalty mode must be 'flat', 'percent', or 'none'."]);
    }

    $penaltyValue = isset($data['penalty_value']) ? round((float)$data['penalty_value'], 2) : $current['penalty_value'];
    if ($penaltyValue < 0) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Penalty value cannot be negative."]);
    }

    $blockOverdue = isset($data['block_overdue_accounts'])
      ? (in_array(strtolower(trim((string)$data['block_overdue_accounts'])), ['1', 'true', 'yes', 'on'], true) ? '1' : '0')
      : (string)$current['block_overdue_accounts'];

    $pairs = [
      'ar_default_term_days' => (string)$termDays,
      'ar_interest_mode' => $interestMode,
      'ar_interest_rate_pct' => number_format($interestRate, 2, '.', ''),
      'ar_penalty_mode' => $penaltyMode,
      'ar_penalty_value' => number_format($penaltyValue, 2, '.', ''),
      'ar_block_overdue_accounts' => $blockOverdue
    ];

    try {
      $conn->beginTransaction();
      $chk = $conn->prepare("SELECT COUNT(*) FROM tblsystem_settings WHERE setting_key = :k");
      $upd = $conn->prepare("UPDATE tblsystem_settings SET setting_value = :v, updated_at = CURRENT_TIMESTAMP WHERE setting_key = :k");
      $ins = $conn->prepare("INSERT INTO tblsystem_settings (setting_key, setting_value, updated_at) VALUES (:k, :v, CURRENT_TIMESTAMP)");
      foreach ($pairs as $k => $v) {
        $chk->execute([":k" => $k]);
        if ((int)$chk->fetchColumn() > 0) {
          $upd->execute([":v" => $v, ":k" => $k]);
        } else {
          $ins->execute([":k" => $k, ":v" => $v]);
        }
      }
      $conn->commit();
      return json_encode([
        "returnValue" => 1,
        "message" => "AR Overdue Policy saved.",
        "policy" => getOverduePolicySettings($conn)
      ]);
    } catch (Throwable $e) {
      if ($conn->inTransaction()) $conn->rollBack();
      http_response_code(500);
      return json_encode(["returnValue" => 0, "message" => "Failed to save overdue policy: " . $e->getMessage()]);
    }
  }

  function computeAgingBucket($balance, $daysOverdue) {
    $bal = (float)$balance;
    $days = (int)$daysOverdue;
    if ($bal <= 0) {
      return 'Paid';
    }
    if ($days <= 0) {
      return 'Current';
    }
    if ($days <= 30) {
      return '1-30 Days';
    }
    if ($days <= 60) {
      return '31-60 Days';
    }
    return '60+ Days';
  }

  function computeOverdueMath($principalAmount, $daysOverdue, $policy, $overridePeriods = null) {
    $P = round((float)$principalAmount, 2);
    $days = max(0, (int)$daysOverdue);
    if ($overridePeriods !== null && is_numeric($overridePeriods) && (int)$overridePeriods >= 1) {
      $periods = (int)$overridePeriods;
    } else {
      $periods = $days > 0 ? max(1, (int)floor($days / 30)) : 0;
    }

    $ratePct = round((float)($policy['interest_rate_pct'] ?? 5.0), 2);
    $r = $ratePct / 100.0;
    $mode = strtolower(trim($policy['interest_mode'] ?? 'fixed'));

    $interestAmt = 0.00;
    if ($periods > 0 && $P > 0 && $r > 0) {
      if ($mode === 'compounding') {
        $interestAmt = round($P * (pow(1.0 + $r, $periods) - 1.0), 2);
      } else {
        $interestAmt = round($P * $r * $periods, 2);
      }
    }

    $penaltyMode = strtolower(trim($policy['penalty_mode'] ?? 'flat'));
    $penaltyVal = round((float)($policy['penalty_value'] ?? 0.0), 2);
    $penaltyAmt = 0.00;
    if ($days > 0 && $P > 0 && $penaltyVal > 0 && $penaltyMode !== 'none') {
      if ($penaltyMode === 'percent') {
        $penaltyAmt = round($P * ($penaltyVal / 100.0), 2);
      } else {
        $penaltyAmt = round($penaltyVal, 2);
      }
    }

    return [
      "principal_amount" => $P,
      "days_overdue" => $days,
      "periods" => $periods,
      "interest_mode" => $mode,
      "interest_rate_pct" => $ratePct,
      "interest_amount" => $interestAmt,
      "penalty_mode" => $penaltyMode,
      "penalty_value" => $penaltyVal,
      "penalty_amount" => $penaltyAmt,
      "total_overdue_charge" => round($interestAmt + $penaltyAmt, 2)
    ];
  }

  function previewOverdueCharge($json) {
    include "connection-pdo.php";
    $data = json_decode($json, true) ?: [];
    $invoiceId = filter_var($data['invoiceId'] ?? ($data['arInvoiceId'] ?? null), FILTER_VALIDATE_INT);
    if (!$invoiceId || $invoiceId < 1) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Select a valid AR invoice to preview overdue charges."]);
    }

    $stmt = $conn->prepare(
      "SELECT i.ar_invoice_id, i.invoice_number, i.ar_customer_id, i.invoice_date, i.due_date,
              COALESCE(i.principal_amount, i.invoice_amount) AS principal_amount,
              i.invoice_amount, i.balance, i.status, c.customer_name
       FROM tblar_invoice i
       INNER JOIN tblar_customers c ON c.ar_customer_id = i.ar_customer_id
       WHERE i.ar_invoice_id = :invoiceId"
    );
    $stmt->execute([":invoiceId" => $invoiceId]);
    $inv = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$inv) {
      http_response_code(404);
      return json_encode(["returnValue" => 0, "message" => "Invoice not found."]);
    }

    $policy = getOverduePolicySettings($conn);
    if (!empty($data['interest_mode']) && in_array(strtolower($data['interest_mode']), ['fixed', 'compounding'], true)) {
      $policy['interest_mode'] = strtolower($data['interest_mode']);
    }
    if (isset($data['interest_rate_pct']) && is_numeric($data['interest_rate_pct'])) {
      $policy['interest_rate_pct'] = round((float)$data['interest_rate_pct'], 2);
    }
    if (!empty($data['penalty_mode']) && in_array(strtolower($data['penalty_mode']), ['flat', 'percent', 'none'], true)) {
      $policy['penalty_mode'] = strtolower($data['penalty_mode']);
    }
    if (isset($data['penalty_value']) && is_numeric($data['penalty_value'])) {
      $policy['penalty_value'] = round((float)$data['penalty_value'], 2);
    }

    $todayTs = strtotime(date('Y-m-d'));
    $daysOverdue = 0;
    if (!empty($inv['due_date'])) {
      $dueTs = strtotime(substr((string)$inv['due_date'], 0, 10));
      if ($dueTs && $todayTs > $dueTs) {
        $daysOverdue = (int)floor(($todayTs - $dueTs) / 86400);
      }
    }
    if (isset($data['days_overdue']) && is_numeric($data['days_overdue']) && (int)$data['days_overdue'] >= 0) {
      $daysOverdue = (int)$data['days_overdue'];
    }

    $overridePeriods = isset($data['periods']) && is_numeric($data['periods']) ? (int)$data['periods'] : null;
    $math = computeOverdueMath($inv['principal_amount'], $daysOverdue, $policy, $overridePeriods);

    return json_encode([
      "returnValue" => 1,
      "invoice" => $inv,
      "calculation" => $math,
      "resulting_balance" => round((float)$inv['balance'] + $math['total_overdue_charge'], 2)
    ]);
  }

  function applyOverdueCharge($json, $user) {
    include "connection-pdo.php";
    $data = json_decode($json, true) ?: [];
    $invoiceId = filter_var($data['invoiceId'] ?? ($data['arInvoiceId'] ?? null), FILTER_VALIDATE_INT);
    if (!$invoiceId || $invoiceId < 1) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "A valid overdue invoice ID is required."]);
    }

    try {
      $conn->beginTransaction();
      $stmt = $conn->prepare(
        "SELECT i.ar_invoice_id, i.invoice_number, i.ar_customer_id, i.invoice_date, i.due_date,
                COALESCE(i.principal_amount, i.invoice_amount) AS principal_amount,
                i.invoice_amount, i.balance, i.status, c.customer_name
         FROM tblar_invoice i
         INNER JOIN tblar_customers c ON c.ar_customer_id = i.ar_customer_id
         WHERE i.ar_invoice_id = :invoiceId FOR UPDATE"
      );
      $stmt->execute([":invoiceId" => $invoiceId]);
      $inv = $stmt->fetch(PDO::FETCH_ASSOC);
      if (!$inv || (float)$inv['balance'] <= 0) {
        $conn->rollBack();
        http_response_code(422);
        return json_encode(["returnValue" => 0, "message" => "Invoice is not open or has zero balance."]);
      }

      $policy = getOverduePolicySettings($conn);
      if (!empty($data['interest_mode']) && in_array(strtolower($data['interest_mode']), ['fixed', 'compounding'], true)) {
        $policy['interest_mode'] = strtolower($data['interest_mode']);
      }
      if (isset($data['interest_rate_pct']) && is_numeric($data['interest_rate_pct'])) {
        $policy['interest_rate_pct'] = round((float)$data['interest_rate_pct'], 2);
      }
      if (!empty($data['penalty_mode']) && in_array(strtolower($data['penalty_mode']), ['flat', 'percent', 'none'], true)) {
        $policy['penalty_mode'] = strtolower($data['penalty_mode']);
      }
      if (isset($data['penalty_value']) && is_numeric($data['penalty_value'])) {
        $policy['penalty_value'] = round((float)$data['penalty_value'], 2);
      }

      $todayTs = strtotime(date('Y-m-d'));
      $daysOverdue = 0;
      if (!empty($inv['due_date'])) {
        $dueTs = strtotime(substr((string)$inv['due_date'], 0, 10));
        if ($dueTs && $todayTs > $dueTs) {
          $daysOverdue = (int)floor(($todayTs - $dueTs) / 86400);
        }
      }
      if (isset($data['days_overdue']) && is_numeric($data['days_overdue']) && (int)$data['days_overdue'] > 0) {
        $daysOverdue = (int)$data['days_overdue'];
      }
      if ($daysOverdue <= 0) {
        $conn->rollBack();
        http_response_code(422);
        return json_encode(["returnValue" => 0, "message" => "Invoice {$inv['invoice_number']} is not overdue yet."]);
      }

      $overridePeriods = isset($data['periods']) && is_numeric($data['periods']) ? (int)$data['periods'] : null;
      $math = computeOverdueMath($inv['principal_amount'], $daysOverdue, $policy, $overridePeriods);
      if ($math['total_overdue_charge'] <= 0) {
        $conn->rollBack();
        http_response_code(422);
        return json_encode(["returnValue" => 0, "message" => "Computed overdue charge is zero under current policy."]);
      }

      $shiftStmt = $conn->query("SELECT shift_id FROM tblshifts WHERE status = 'open' ORDER BY shift_id DESC LIMIT 1");
      $openShiftId = $shiftStmt ? ((int)$shiftStmt->fetchColumn() ?: null) : null;

      $insEntry = $conn->prepare(
        "INSERT INTO tblar_ledger_entries
          (ar_customer_id, ar_invoice_id, shift_id, entry_type, amount, balance_before, balance_after, reason, reference_no, authorized_by_supervisor_id, created_by_user_id, created_at)
         VALUES (:cid, :iid, :sid, :etype, :amt, :bbefore, :bafter, :reason, :ref, :supId, :uid, CURRENT_TIMESTAMP)"
      );

      $runningBalance = round((float)$inv['balance'], 2);
      $entriesCreated = [];

      if ($math['interest_amount'] > 0) {
        $before = $runningBalance;
        $runningBalance = round($runningBalance + $math['interest_amount'], 2);
        $ref = "INT-" . $inv['invoice_number'] . "-" . date("YmdHis");
        $reason = strtoupper($math['interest_mode']) . " Overdue Interest ({$math['interest_rate_pct']}% x {$math['periods']} period(s), {$daysOverdue}d overdue on principal ₱" . number_format($math['principal_amount'], 2) . ")";
        $insEntry->execute([
          ":cid" => $inv['ar_customer_id'],
          ":iid" => $inv['ar_invoice_id'],
          ":sid" => $openShiftId,
          ":etype" => "overdue_interest",
          ":amt" => $math['interest_amount'],
          ":bbefore" => $before,
          ":bafter" => $runningBalance,
          ":reason" => $reason,
          ":ref" => $ref,
          ":supId" => $user['user_id'],
          ":uid" => $user['user_id']
        ]);
        $entriesCreated[] = [
          "entry_id" => (int)$conn->lastInsertId(),
          "entry_type" => "overdue_interest",
          "amount" => $math['interest_amount'],
          "balance_before" => $before,
          "balance_after" => $runningBalance,
          "reason" => $reason,
          "reference_no" => $ref
        ];
      }

      if ($math['penalty_amount'] > 0) {
        $before = $runningBalance;
        $runningBalance = round($runningBalance + $math['penalty_amount'], 2);
        $ref = "PEN-" . $inv['invoice_number'] . "-" . date("YmdHis");
        $reason = strtoupper($math['penalty_mode']) . " Overdue Penalty Fee ({$daysOverdue}d overdue)";
        $insEntry->execute([
          ":cid" => $inv['ar_customer_id'],
          ":iid" => $inv['ar_invoice_id'],
          ":sid" => $openShiftId,
          ":etype" => "overdue_penalty",
          ":amt" => $math['penalty_amount'],
          ":bbefore" => $before,
          ":bafter" => $runningBalance,
          ":reason" => $reason,
          ":ref" => $ref,
          ":supId" => $user['user_id'],
          ":uid" => $user['user_id']
        ]);
        $entriesCreated[] = [
          "entry_id" => (int)$conn->lastInsertId(),
          "entry_type" => "overdue_penalty",
          "amount" => $math['penalty_amount'],
          "balance_before" => $before,
          "balance_after" => $runningBalance,
          "reason" => $reason,
          "reference_no" => $ref
        ];
      }

      $newInvoiceAmount = round((float)$inv['invoice_amount'] + $math['total_overdue_charge'], 2);
      $updInv = $conn->prepare(
        "UPDATE tblar_invoice
         SET principal_amount = COALESCE(principal_amount, invoice_amount),
             invoice_amount = :invAmt,
             balance = :bal
         WHERE ar_invoice_id = :iid"
      );
      $updInv->execute([
        ":invAmt" => $newInvoiceAmount,
        ":bal" => $runningBalance,
        ":iid" => $inv['ar_invoice_id']
      ]);

      $conn->commit();
      return json_encode([
        "returnValue" => 1,
        "message" => "Overdue adjustment entry posted to AR ledger.",
        "invoice_id" => (int)$inv['ar_invoice_id'],
        "invoice_number" => $inv['invoice_number'],
        "calculation" => $math,
        "new_balance" => $runningBalance,
        "entries" => $entriesCreated
      ]);
    } catch (Throwable $e) {
      if ($conn->inTransaction()) $conn->rollBack();
      http_response_code(500);
      return json_encode(["returnValue" => 0, "message" => "Failed to post overdue charges: " . $e->getMessage()]);
    }
  }

  function createArMemo($json, $user) {
    include "connection-pdo.php";
    $data = json_decode($json, true) ?: [];

    $customerId = filter_var($data['customerId'] ?? ($data['arCustomerId'] ?? ($data['ar_customer_id'] ?? null)), FILTER_VALIDATE_INT);
    $invoiceId = filter_var($data['invoiceId'] ?? ($data['arInvoiceId'] ?? ($data['ar_invoice_id'] ?? null)), FILTER_VALIDATE_INT);
    $memoType = strtolower(trim((string)($data['memoType'] ?? ($data['entry_type'] ?? ''))));
    if ($memoType === 'credit') $memoType = 'credit_memo';
    if ($memoType === 'debit') $memoType = 'debit_memo';

    if (!in_array($memoType, ['credit_memo', 'debit_memo'], true)) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Memo type must be 'credit_memo' or 'debit_memo'."]);
    }

    $amountCents = paymentAmountToCents($data['amount'] ?? null);
    if (!$customerId || $customerId < 1 || $amountCents === null || $amountCents <= 0) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Select a valid AR customer and enter a positive memo amount."]);
    }
    $amount = round($amountCents / 100.0, 2);

    $reason = trim((string)($data['reason'] ?? ''));
    $referenceNo = trim((string)($data['referenceNo'] ?? ($data['reference_no'] ?? '')));
    if ($reason === '' || $referenceNo === '') {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Both a Reason and a Reference Number are required for Credit/Debit Memos."]);
    }

    // Supervisor/Owner Credential Gate REMOVED per Bug #2: Memos post directly after user confirms.
    $shiftId = filter_var($data['shiftId'] ?? ($data['shift_id'] ?? null), FILTER_VALIDATE_INT) ?: null;
    if (!$shiftId) {
      $shiftStmt = $conn->query("SELECT shift_id FROM tblshifts WHERE status = 'open' ORDER BY shift_id DESC LIMIT 1");
      if ($shiftStmt) {
        $shiftId = (int)$shiftStmt->fetchColumn() ?: null;
      }
    }

    try {
      $conn->beginTransaction();

      // Find target invoice
      $targetInv = null;
      if ($invoiceId && $invoiceId > 0) {
        $invStmt = $conn->prepare(
          "SELECT ar_invoice_id, invoice_number, ar_customer_id, invoice_amount, balance, status
           FROM tblar_invoice
           WHERE ar_invoice_id = :iid AND ar_customer_id = :cid FOR UPDATE"
        );
        $invStmt->execute([":iid" => $invoiceId, ":cid" => $customerId]);
        $targetInv = $invStmt->fetch(PDO::FETCH_ASSOC);
      } else {
        $invStmt = $conn->prepare(
          "SELECT ar_invoice_id, invoice_number, ar_customer_id, invoice_amount, balance, status
           FROM tblar_invoice
           WHERE ar_customer_id = :cid AND status <> 'Pending' AND COALESCE(balance, 0) > 0
           ORDER BY due_date ASC, ar_invoice_id ASC LIMIT 1 FOR UPDATE"
        );
        $invStmt->execute([":cid" => $customerId]);
        $targetInv = $invStmt->fetch(PDO::FETCH_ASSOC);
      }

      if ($memoType === 'credit_memo') {
        if (!$targetInv || (float)$targetInv['balance'] <= 0) {
          $conn->rollBack();
          http_response_code(422);
          return json_encode(["returnValue" => 0, "message" => "Customer has no open invoice balance to apply a Credit Memo against."]);
        }
        $beforeBal = round((float)$targetInv['balance'], 2);
        if ($amount > $beforeBal) {
          $conn->rollBack();
          http_response_code(422);
          return json_encode([
            "returnValue" => 0,
            "message" => "Credit Memo amount (₱" . number_format($amount, 2) . ") cannot exceed the invoice open balance (₱" . number_format($beforeBal, 2) . ")."
          ]);
        }
        $afterBal = round($beforeBal - $amount, 2);
        $newStatus = $afterBal <= 0.00 ? 'Paid' : 'Partially Paid';

        $updInv = $conn->prepare("UPDATE tblar_invoice SET balance = :bal, status = :st WHERE ar_invoice_id = :iid");
        $updInv->execute([":bal" => $afterBal, ":st" => $newStatus, ":iid" => $targetInv['ar_invoice_id']]);
        $invoiceId = (int)$targetInv['ar_invoice_id'];
        $invoiceNumber = $targetInv['invoice_number'];

        // Synchronize with tblar_credit_memo
        $insCm = $conn->prepare(
          "INSERT INTO tblar_credit_memo (ar_invoice_id, issue_date, amount, invoice_balance, issued_by_user_id, status)
           VALUES (:iid, CURRENT_DATE, :amt, :bal, :uid, 'Approved')"
        );
        $insCm->execute([
          ":iid" => $invoiceId,
          ":amt" => $amount,
          ":bal" => $afterBal,
          ":uid" => $user['user_id']
        ]);
      } else {
        // debit_memo: increases balance (corrections/manual fees)
        if ($targetInv) {
          $beforeBal = round((float)$targetInv['balance'], 2);
          $afterBal = round($beforeBal + $amount, 2);
          $newInvAmt = round((float)$targetInv['invoice_amount'] + $amount, 2);
          $newStatus = $targetInv['status'] === 'Paid' ? 'Partially Paid' : $targetInv['status'];

          $updInv = $conn->prepare(
            "UPDATE tblar_invoice SET invoice_amount = :invAmt, balance = :bal, status = :st WHERE ar_invoice_id = :iid"
          );
          $updInv->execute([
            ":invAmt" => $newInvAmt,
            ":bal" => $afterBal,
            ":st" => $newStatus,
            ":iid" => $targetInv['ar_invoice_id']
          ]);
          $invoiceId = (int)$targetInv['ar_invoice_id'];
          $invoiceNumber = $targetInv['invoice_number'];
        } else {
          // Create a standalone Debit Memo invoice if customer had no open invoice
          $policy = getOverduePolicySettings($conn);
          $termDays = (int)$policy['default_term_days'];
          $dueDate = date('Y-m-d', strtotime("+{$termDays} days"));
          $invoiceNumber = "DM-" . date("Ymd-His");
          $beforeBal = 0.00;
          $afterBal = $amount;
          $insInv = $conn->prepare(
            "INSERT INTO tblar_invoice (invoice_number, ar_customer_id, created_by_user_id, invoice_date, due_date, principal_amount, invoice_amount, balance, status)
             VALUES (:num, :cid, :uid, CURRENT_DATE, :dueDate, :amt, :amt2, :bal, 'Approved')"
          );
          $insInv->execute([
            ":num" => $invoiceNumber,
            ":cid" => $customerId,
            ":uid" => $user['user_id'],
            ":dueDate" => $dueDate,
            ":amt" => $amount,
            ":amt2" => $amount,
            ":bal" => $amount
          ]);
          $invoiceId = (int)$conn->lastInsertId();
        }

        // Synchronize with tblar_debit_memo
        $insDm = $conn->prepare(
          "INSERT INTO tblar_debit_memo (ar_invoice_id, issue_date, amount, issued_by_user_id, status)
           VALUES (:iid, CURRENT_DATE, :amt, :uid, 'Approved')"
        );
        $insDm->execute([
          ":iid" => $invoiceId,
          ":amt" => $amount,
          ":uid" => $user['user_id']
        ]);
      }

      $entryNumber = ($memoType === 'credit_memo' ? 'CM-' : 'DM-') . date('YmdHis') . '-' . mt_rand(100, 999);
      $insLedger = $conn->prepare(
        "INSERT INTO tblar_ledger_entries
          (entry_number, ar_customer_id, ar_invoice_id, shift_id, entry_type, amount, balance_before, balance_after, reason, reference_no, authorized_by_supervisor_id, auth_log_id, created_by_user_id, created_at)
         VALUES (:entryNo, :cid, :iid, :sid, :etype, :amt, :bbefore, :bafter, :reason, :ref, :supId, :logId, :uid, CURRENT_TIMESTAMP)"
      );
      $insLedger->execute([
        ":entryNo" => $entryNumber,
        ":cid" => $customerId,
        ":iid" => $invoiceId,
        ":sid" => $shiftId,
        ":etype" => $memoType,
        ":amt" => $amount,
        ":bbefore" => $beforeBal,
        ":bafter" => $afterBal,
        ":reason" => $reason,
        ":ref" => $referenceNo,
        ":supId" => null,
        ":logId" => null,
        ":uid" => $user['user_id']
      ]);
      $entryId = (int)$conn->lastInsertId();

      $conn->commit();
      return json_encode([
        "returnValue" => 1,
        "message" => ($memoType === 'credit_memo' ? "Credit Memo" : "Debit Memo") . " posted successfully.",
        "entry" => [
          "entry_id" => $entryId,
          "entry_number" => $entryNumber,
          "ar_customer_id" => $customerId,
          "ar_invoice_id" => $invoiceId,
          "invoice_number" => $invoiceNumber,
          "shift_id" => $shiftId,
          "entry_type" => $memoType,
          "amount" => $amount,
          "balance_before" => $beforeBal,
          "balance_after" => $afterBal,
          "reason" => $reason,
          "reference_no" => $referenceNo,
          "authorized_by_supervisor_id" => null
        ]
      ]);
    } catch (Throwable $e) {
      if ($conn->inTransaction()) $conn->rollBack();
      http_response_code(500);
      return json_encode(["returnValue" => 0, "message" => "Failed to post memo: " . $e->getMessage()]);
    }
  }

  function getLedgerEntries($customerId = null) {
    include "connection-pdo.php";
    $cid = filter_var($customerId, FILTER_VALIDATE_INT);
    $where = ($cid && $cid > 0) ? "WHERE e.ar_customer_id = :cid" : "";
    $sql = "SELECT e.entry_id, e.entry_number, e.ar_customer_id, e.ar_invoice_id, e.shift_id, e.entry_type,
                   e.amount, e.balance_before, e.balance_after, e.reason, e.reference_no,
                   e.authorized_by_supervisor_id, e.created_by_user_id, e.created_at,
                   c.customer_name, i.invoice_number,
                   CONCAT(sup.first_name, ' ', sup.last_name) AS supervisor_name,
                   CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
            FROM tblar_ledger_entries e
            INNER JOIN tblar_customers c ON c.ar_customer_id = e.ar_customer_id
            LEFT JOIN tblar_invoice i ON i.ar_invoice_id = e.ar_invoice_id
            LEFT JOIN tblusers sup ON sup.user_id = e.authorized_by_supervisor_id
            LEFT JOIN tblusers u ON u.user_id = e.created_by_user_id
            {$where}
            ORDER BY e.entry_id DESC";
    $stmt = $conn->prepare($sql);
    if ($cid && $cid > 0) {
      $stmt->execute([":cid" => $cid]);
    } else {
      $stmt->execute();
    }
    return json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
  }

  /**
   * Configurable Running-Balance Transaction Ledger Engine
   * Normal Balance Rule:
   * - 'AR' (Asset / Receivable): Increases with Debits (Dr), decreases with Credits (Cr).
   * - 'AP' / Liability / Equity / Revenue: Increases with Credits (Cr), decreases with Debits (Dr).
   */
  function computeRunningBalanceRow($previousBalance, $debit, $credit, $accountType = 'AR') {
    if (strtoupper($accountType) === 'AR') {
      return round((float)$previousBalance + (float)$debit - (float)$credit, 2);
    } else {
      return round((float)$previousBalance + (float)$credit - (float)$debit, 2);
    }
  }

  function getCustomerLedger($customerId = null, $accountType = 'AR') {
    include "connection-pdo.php";
    $cid = filter_var($customerId, FILTER_VALIDATE_INT);

    // If no customerId provided, return list of all active AR customers with summary totals
    if (!$cid || $cid < 1) {
      $custStmt = $conn->query(
        "SELECT c.ar_customer_id, c.customer_name, c.credit_limit,
                COALESCE(SUM(CASE WHEN i.status <> 'Pending' AND COALESCE(i.balance, 0) > 0 THEN i.balance ELSE 0 END), 0) AS current_balance,
                COUNT(CASE WHEN i.status <> 'Pending' AND COALESCE(i.balance, 0) > 0 THEN 1 END) AS open_invoices
         FROM tblar_customers c
         LEFT JOIN tblar_invoice i ON i.ar_customer_id = c.ar_customer_id
         WHERE c.is_active = 1
         GROUP BY c.ar_customer_id, c.customer_name, c.credit_limit
         ORDER BY c.customer_name ASC"
      );
      return json_encode([
        "returnValue" => 1,
        "customers" => $custStmt->fetchAll(PDO::FETCH_ASSOC),
        "selectedCustomer" => null,
        "rows" => []
      ]);
    }

    $cStmt = $conn->prepare("SELECT ar_customer_id, customer_name, credit_limit, contact_name, contact_phone, billing_address FROM tblar_customers WHERE ar_customer_id = :cid");
    $cStmt->execute([":cid" => $cid]);
    $customer = $cStmt->fetch(PDO::FETCH_ASSOC);
    if (!$customer) {
      http_response_code(404);
      return json_encode(["returnValue" => 0, "message" => "Customer account not found."]);
    }

    // System's current outstanding balance for this account
    $balStmt = $conn->prepare(
      "SELECT COALESCE(SUM(balance), 0) 
       FROM tblar_invoice 
       WHERE ar_customer_id = :cid AND status <> 'Pending' AND COALESCE(balance, 0) > 0"
    );
    $balStmt->execute([":cid" => $cid]);
    $currentBalance = round((float)$balStmt->fetchColumn(), 2);

    $txs = [];

    // 1. Invoices (Debit / Dr - increases receivable)
    $invStmt = $conn->prepare(
      "SELECT ar_invoice_id, invoice_number, invoice_date, principal_amount, invoice_amount, balance, status
       FROM tblar_invoice 
       WHERE ar_customer_id = :cid AND status <> 'Pending'"
    );
    $invStmt->execute([":cid" => $cid]);
    foreach ($invStmt->fetchAll(PDO::FETCH_ASSOC) as $inv) {
      $amt = round((float)($inv['principal_amount'] ?? $inv['invoice_amount']), 2);
      $txs[] = [
        'id' => 'INV-' . $inv['ar_invoice_id'],
        'date' => $inv['invoice_date'] ?: '2026-01-01',
        'created_at' => ($inv['invoice_date'] ?: '2026-01-01') . ' 08:00:00',
        'type' => 'Invoice',
        'badge' => 'primary',
        'reference_no' => $inv['invoice_number'],
        'description' => 'Invoice #' . $inv['invoice_number'] . ($inv['status'] === 'Paid' ? ' (Paid)' : ''),
        'debit' => $amt,
        'credit' => 0.00
      ];
    }

    // 2. Payments (Credit / Cr - decreases receivable)
    $pmtStmt = $conn->prepare(
      "SELECT d.payment_detail_id, d.applied_amount, COALESCE(d.applied_date, h.payment_date) AS tx_date,
              h.reference_number, h.notes, m.method_name, i.invoice_number
       FROM tblpayment_detail d
       JOIN tblpayment_header h ON h.payment_id = d.payment_id
       JOIN tblar_invoice i ON i.ar_invoice_id = d.ar_invoice_id
       LEFT JOIN tblpayment_method m ON m.payment_method_id = h.payment_method_id
       WHERE i.ar_customer_id = :cid"
    );
    $pmtStmt->execute([":cid" => $cid]);
    foreach ($pmtStmt->fetchAll(PDO::FETCH_ASSOC) as $p) {
      $desc = 'Payment (' . ($p['method_name'] ?: 'Cash') . ') - Inv #' . $p['invoice_number'];
      if (!empty($p['notes'])) $desc .= ' - ' . $p['notes'];
      $txs[] = [
        'id' => 'PMT-' . $p['payment_detail_id'],
        'date' => $p['tx_date'] ?: '2026-01-01',
        'created_at' => ($p['tx_date'] ?: '2026-01-01') . ' 12:00:00',
        'type' => 'Payment',
        'badge' => 'success',
        'reference_no' => $p['reference_number'] ?: ('PAY-' . $p['payment_detail_id']),
        'description' => $desc,
        'debit' => 0.00,
        'credit' => round((float)$p['applied_amount'], 2)
      ];
    }

    // 3. Ledger Entries: Credit Memos (Cr), Debit Memos (Dr), Overdue Interest (Dr), Overdue Penalty (Dr)
    $leStmt = $conn->prepare(
      "SELECT e.entry_id, e.entry_number, e.entry_type, e.amount, e.reason, e.reference_no,
              e.created_at, DATE(e.created_at) AS tx_date, i.invoice_number
       FROM tblar_ledger_entries e
       LEFT JOIN tblar_invoice i ON i.ar_invoice_id = e.ar_invoice_id
       WHERE e.ar_customer_id = :cid"
    );
    $leStmt->execute([":cid" => $cid]);
    foreach ($leStmt->fetchAll(PDO::FETCH_ASSOC) as $le) {
      $etype = $le['entry_type'];
      $isCredit = ($etype === 'credit_memo');
      $typeName = ($etype === 'credit_memo') ? 'Credit Memo' :
                  (($etype === 'debit_memo') ? 'Debit Memo' :
                  (($etype === 'overdue_interest') ? 'Overdue Interest' : 'Overdue Penalty'));
      $badge = ($etype === 'credit_memo') ? 'success' :
               (($etype === 'debit_memo') ? 'warning text-dark' :
               (($etype === 'overdue_interest') ? 'danger' : 'dark'));

      $desc = $typeName;
      if (!empty($le['invoice_number'])) $desc .= ' (Inv #' . $le['invoice_number'] . ')';
      if (!empty($le['reason'])) $desc .= ' - ' . $le['reason'];

      $txs[] = [
        'id' => 'LE-' . $le['entry_id'],
        'date' => $le['tx_date'],
        'created_at' => $le['created_at'],
        'type' => $typeName,
        'badge' => $badge,
        'reference_no' => $le['reference_no'] ?: $le['entry_number'],
        'description' => $desc,
        'debit' => $isCredit ? 0.00 : round((float)$le['amount'], 2),
        'credit' => $isCredit ? round((float)$le['amount'], 2) : 0.00
      ];
    }

    // 4. Legacy Credit Memos (tblar_credit_memo) if not already recorded in tblar_ledger_entries
    $cmStmt = $conn->prepare(
      "SELECT cm.credit_memo_id, cm.amount, cm.issue_date, i.invoice_number
       FROM tblar_credit_memo cm
       JOIN tblar_invoice i ON i.ar_invoice_id = cm.ar_invoice_id
       WHERE i.ar_customer_id = :cid
         AND NOT EXISTS (
           SELECT 1 FROM tblar_ledger_entries le 
           WHERE le.ar_invoice_id = cm.ar_invoice_id 
             AND le.entry_type = 'credit_memo' 
             AND DATE(le.created_at) = cm.issue_date 
             AND ABS(le.amount - cm.amount) < 0.001
         )"
    );
    $cmStmt->execute([":cid" => $cid]);
    foreach ($cmStmt->fetchAll(PDO::FETCH_ASSOC) as $cm) {
      $txs[] = [
        'id' => 'CM-' . $cm['credit_memo_id'],
        'date' => $cm['issue_date'] ?: '2026-09-20',
        'created_at' => ($cm['issue_date'] ?: '2026-09-20') . ' 10:00:00',
        'type' => 'Credit Memo',
        'badge' => 'success',
        'reference_no' => 'CM-' . $cm['credit_memo_id'],
        'description' => 'Credit Memo (Inv #' . $cm['invoice_number'] . ')',
        'debit' => 0.00,
        'credit' => round((float)$cm['amount'], 2)
      ];
    }

    // 5. Legacy Debit Memos (tblar_debit_memo) if not already recorded in tblar_ledger_entries
    $dmStmt = $conn->prepare(
      "SELECT dm.debit_memo_id, dm.amount, dm.issue_date, i.invoice_number
       FROM tblar_debit_memo dm
       JOIN tblar_invoice i ON i.ar_invoice_id = dm.ar_invoice_id
       WHERE i.ar_customer_id = :cid
         AND NOT EXISTS (
           SELECT 1 FROM tblar_ledger_entries le 
           WHERE le.ar_invoice_id = dm.ar_invoice_id 
             AND le.entry_type = 'debit_memo' 
             AND DATE(le.created_at) = dm.issue_date 
             AND ABS(le.amount - dm.amount) < 0.001
         )"
    );
    $dmStmt->execute([":cid" => $cid]);
    foreach ($dmStmt->fetchAll(PDO::FETCH_ASSOC) as $dm) {
      $txs[] = [
        'id' => 'DM-' . $dm['debit_memo_id'],
        'date' => $dm['issue_date'] ?: '2026-09-20',
        'created_at' => ($dm['issue_date'] ?: '2026-09-20') . ' 10:00:00',
        'type' => 'Debit Memo',
        'badge' => 'warning text-dark',
        'reference_no' => 'DM-' . $dm['debit_memo_id'],
        'description' => 'Debit Memo (Inv #' . $dm['invoice_number'] . ')',
        'debit' => round((float)$dm['amount'], 2),
        'credit' => 0.00
      ];
    }

    // Sort chronologically
    usort($txs, function($a, $b) {
      $c = strcmp($a['date'], $b['date']);
      if ($c !== 0) return $c;
      $c2 = strcmp($a['created_at'], $b['created_at']);
      if ($c2 !== 0) return $c2;
      return strcmp($a['id'], $b['id']);
    });

    // Compute net transactions
    $totDr = 0.00;
    $totCr = 0.00;
    foreach ($txs as $t) {
      $totDr = round($totDr + $t['debit'], 2);
      $totCr = round($totCr + $t['credit'], 2);
    }
    $netTxs = round($totDr - $totCr, 2);

    $rows = [];
    $running = 0.00;

    // Consistency Anchor: If historical balance forward exists, record as beginning balance row
    if ($netTxs != $currentBalance) {
      $openBal = round($currentBalance - $netTxs, 2);
      $running = $openBal;
      $firstDate = !empty($txs) ? $txs[0]['date'] : date('Y-m-d');
      $rows[] = [
        'id' => 'BAL-FWD',
        'date' => $firstDate,
        'type' => 'Beginning Balance',
        'badge' => 'secondary',
        'reference_no' => 'BAL-FWD',
        'description' => 'Prior Account Balance Forward / Opening Balance',
        'debit' => $openBal > 0 ? $openBal : 0.00,
        'credit' => $openBal < 0 ? abs($openBal) : 0.00,
        'balance' => $running
      ];
    }

    foreach ($txs as $t) {
      $running = computeRunningBalanceRow($running, $t['debit'], $t['credit'], $accountType);
      $rows[] = [
        'id' => $t['id'],
        'date' => $t['date'],
        'type' => $t['type'],
        'badge' => $t['badge'],
        'reference_no' => $t['reference_no'],
        'description' => $t['description'],
        'debit' => $t['debit'],
        'credit' => $t['credit'],
        'balance' => $running
      ];
    }

    $finalBalance = !empty($rows) ? end($rows)['balance'] : 0.00;

    return json_encode([
      "returnValue" => 1,
      "customer" => $customer,
      "accountType" => $accountType,
      "normalBalance" => (strtoupper($accountType) === 'AR' ? 'Debit' : 'Credit'),
      "currentBalance" => $currentBalance,
      "totalDebits" => $totDr,
      "totalCredits" => $totCr,
      "netTransactions" => $netTxs,
      "finalBalance" => $finalBalance,
      "matches" => ($finalBalance == $currentBalance),
      "rows" => $rows
    ]);
  }

  function getCustomerArHistory($customerId) {
    include "connection-pdo.php";
    $cid = filter_var($customerId, FILTER_VALIDATE_INT);
    if (!$cid || $cid < 1) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Valid customer ID is required."]);
    }
    $cStmt = $conn->prepare("SELECT ar_customer_id, customer_code, customer_name, credit_limit FROM tblar_customers WHERE ar_customer_id = :cid");
    $cStmt->execute([":cid" => $cid]);
    $customer = $cStmt->fetch(PDO::FETCH_ASSOC);
    if (!$customer) {
      http_response_code(404);
      return json_encode(["returnValue" => 0, "message" => "Customer not found."]);
    }

    $invStmt = $conn->prepare(
      "SELECT ar_invoice_id, invoice_number, invoice_date, due_date,
              COALESCE(principal_amount, invoice_amount) AS principal_amount,
              invoice_amount, balance, status
       FROM tblar_invoice
       WHERE ar_customer_id = :cid AND status <> 'Pending'
       ORDER BY ar_invoice_id DESC"
    );
    $invStmt->execute([":cid" => $cid]);
    $invoices = $invStmt->fetchAll(PDO::FETCH_ASSOC);

    $todayTs = strtotime(date('Y-m-d'));
    $aging = [
      "current" => 0.00,
      "days_1_30" => 0.00,
      "days_31_60" => 0.00,
      "days_60_plus" => 0.00
    ];
    foreach ($invoices as &$inv) {
      $bal = round((float)$inv['balance'], 2);
      $daysOverdue = 0;
      if ($bal > 0 && !empty($inv['due_date'])) {
        $dueTs = strtotime(substr((string)$inv['due_date'], 0, 10));
        if ($dueTs && $todayTs > $dueTs) {
          $daysOverdue = (int)floor(($todayTs - $dueTs) / 86400);
        }
      }
      $inv['days_overdue'] = $daysOverdue;
      $bucket = computeAgingBucket($bal, $daysOverdue);
      $inv['aging_bucket'] = $bucket;
      if ($bucket === 'Current') $aging['current'] = round($aging['current'] + $bal, 2);
      elseif ($bucket === '1-30 Days') $aging['days_1_30'] = round($aging['days_1_30'] + $bal, 2);
      elseif ($bucket === '31-60 Days') $aging['days_31_60'] = round($aging['days_31_60'] + $bal, 2);
      elseif ($bucket === '60+ Days') $aging['days_60_plus'] = round($aging['days_60_plus'] + $bal, 2);
    }
    unset($inv);

    $entriesJson = getLedgerEntries($cid);
    $entries = json_decode($entriesJson, true) ?: [];

    return json_encode([
      "returnValue" => 1,
      "customer" => $customer,
      "aging" => $aging,
      "invoices" => $invoices,
      "ledgerEntries" => $entries
    ]);
  }

  function getPaymentFormData($user){
    include "connection-pdo.php";
    $invoices = $conn->query(
      "SELECT a.ar_invoice_id, a.invoice_number, a.ar_customer_id, a.invoice_date, a.due_date,
              COALESCE(a.principal_amount, a.invoice_amount) AS principal_amount,
              a.invoice_amount, a.balance, b.customer_name
       FROM tblar_invoice a
       INNER JOIN tblar_customers b ON a.ar_customer_id = b.ar_customer_id
       WHERE COALESCE(a.balance, 0) > 0 AND a.status <> 'Pending'
       ORDER BY a.invoice_number"
    )->fetchAll(PDO::FETCH_ASSOC);
    $methods = $conn->query(
      "SELECT payment_method_id, method_name
       FROM tblpayment_method
       WHERE is_active = 1
       ORDER BY method_name"
    )->fetchAll(PDO::FETCH_ASSOC);
    $customers = $conn->query(
      "SELECT c.ar_customer_id, c.customer_name, c.credit_limit,
              COALESCE(SUM(i.balance), 0) AS total_debt,
              COUNT(CASE WHEN COALESCE(i.balance, 0) > 0 THEN 1 END) AS open_invoice_count,
              COUNT(CASE WHEN COALESCE(i.balance, 0) > 0 AND i.due_date < CURRENT_DATE THEN 1 END) AS overdue_invoice_count,
              COALESCE(SUM(CASE WHEN COALESCE(i.balance, 0) > 0 AND i.due_date < CURRENT_DATE THEN i.balance ELSE 0 END), 0) AS overdue_balance
       FROM tblar_customers c
       LEFT JOIN tblar_invoice i ON i.ar_customer_id = c.ar_customer_id AND i.status <> 'Pending' AND COALESCE(i.balance, 0) > 0
       WHERE c.is_active = 1
       GROUP BY c.ar_customer_id, c.customer_name, c.credit_limit
       ORDER BY c.customer_name"
    )->fetchAll(PDO::FETCH_ASSOC);
    return json_encode([
      "invoices" => $invoices,
      "customers" => $customers,
      "paymentMethods" => $methods,
      "overduePolicy" => getOverduePolicySettings($conn),
      "canRecordPayment" => in_array($user['role_name'], ['Accounts Receivable Staff', 'Cashier', 'Admin', 'Manager', 'Supervisor'], true)
    ]);
  }

  function getAllPayments(){
    include "connection-pdo.php";
    $sql = "SELECT h.payment_id, h.payment_date, h.amount, h.reference_number, h.notes,
                   m.method_name
            FROM tblpayment_header h
            LEFT JOIN tblpayment_method m ON h.payment_method_id = m.payment_method_id
            ORDER BY h.payment_id DESC";
    $payments = $conn->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    if (!empty($payments)) {
      $detailRows = $conn->query(
        "SELECT d.payment_id, i.ar_invoice_id, i.invoice_number, c.customer_name
         FROM tblpayment_detail d
         INNER JOIN tblar_invoice i ON d.ar_invoice_id = i.ar_invoice_id
         LEFT JOIN tblar_customers c ON i.ar_customer_id = c.ar_customer_id
         ORDER BY d.payment_detail_id ASC"
      )->fetchAll(PDO::FETCH_ASSOC);
      $invMap = [];
      $custMap = [];
      $cntMap = [];
      foreach ($detailRows as $dr) {
        $pid = (int)$dr['payment_id'];
        if (!empty($dr['invoice_number'])) {
          $invMap[$pid][$dr['invoice_number']] = $dr['invoice_number'];
        }
        if (!empty($dr['customer_name']) && empty($custMap[$pid])) {
          $custMap[$pid] = $dr['customer_name'];
        }
        if (!empty($dr['ar_invoice_id'])) {
          $cntMap[$pid][(int)$dr['ar_invoice_id']] = true;
        }
      }
      foreach ($payments as &$prow) {
        $pid = (int)$prow['payment_id'];
        $prow['invoice_number'] = !empty($invMap[$pid]) ? implode(', ', array_values($invMap[$pid])) : '—';
        $prow['customer_name'] = $custMap[$pid] ?? null;
        $prow['invoice_count'] = !empty($cntMap[$pid]) ? count($cntMap[$pid]) : 0;
      }
      unset($prow);
    }
    return json_encode($payments);
  }

  function getPaymentAllocations($paymentId){
    include "connection-pdo.php";
    $pid = filter_var($paymentId, FILTER_VALIDATE_INT);
    if (!$pid) {
      http_response_code(400);
      return json_encode(["returnValue" => 0, "message" => "Invalid payment ID."]);
    }
    $hdrStmt = $conn->prepare(
      "SELECT h.payment_id, h.payment_date, h.amount, h.reference_number, h.notes,
              m.method_name, CONCAT(u.first_name, ' ', u.last_name) AS processed_by
       FROM tblpayment_header h
       LEFT JOIN tblpayment_method m ON h.payment_method_id = m.payment_method_id
       LEFT JOIN tblusers u ON h.processed_by_user_id = u.user_id
       WHERE h.payment_id = :pid"
    );
    $hdrStmt->execute([":pid" => $pid]);
    $header = $hdrStmt->fetch(PDO::FETCH_ASSOC);

    $allocStmt = $conn->prepare(
      "SELECT a.allocation_id, a.invoice_id, a.amount_applied, a.created_at,
              i.invoice_number, i.invoice_date, i.invoice_amount, i.balance AS remaining_balance, i.status AS invoice_status,
              c.customer_name
       FROM tblpayment_allocations a
       INNER JOIN tblar_invoice i ON a.invoice_id = i.ar_invoice_id
       INNER JOIN tblar_customers c ON i.ar_customer_id = c.ar_customer_id
       WHERE a.payment_id = :pid
       ORDER BY a.allocation_id ASC"
    );
    $allocStmt->execute([":pid" => $pid]);
    $allocations = $allocStmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($allocations)) {
      $detailStmt = $conn->prepare(
        "SELECT d.payment_detail_id AS allocation_id, d.ar_invoice_id AS invoice_id, d.applied_amount AS amount_applied, d.applied_date AS created_at,
                i.invoice_number, i.invoice_date, i.invoice_amount, i.balance AS remaining_balance, i.status AS invoice_status,
                c.customer_name
         FROM tblpayment_detail d
         INNER JOIN tblar_invoice i ON d.ar_invoice_id = i.ar_invoice_id
         INNER JOIN tblar_customers c ON i.ar_customer_id = c.ar_customer_id
         WHERE d.payment_id = :pid
         ORDER BY d.payment_detail_id ASC"
      );
      $detailStmt->execute([":pid" => $pid]);
      $allocations = $detailStmt->fetchAll(PDO::FETCH_ASSOC);
    }

    return json_encode([
      "returnValue" => 1,
      "header" => $header,
      "allocations" => $allocations
    ]);
  }

  function getAllInvoices(){
    include "connection-pdo.php";
    $policy = getOverduePolicySettings($conn);
    $defaultTermDays = (int)$policy['default_term_days'];
    // Auto-approve unbilled AR sales so they have invoices
    $unbilled = $conn->query(
      "SELECT s.sale_id, s.sale_date, s.total_amount, s.ar_customer_id, s.cashier_user_id
       FROM tblsales s
       INNER JOIN tblar_customers c ON c.ar_customer_id=s.ar_customer_id
       WHERE s.sale_type='AR' AND NOT EXISTS (SELECT 1 FROM tblar_invoice i WHERE i.sale_id=s.sale_id)"
    )->fetchAll(PDO::FETCH_ASSOC);
    foreach ($unbilled as $ub) {
      $invNumber = "INV-" . str_pad((string)$ub['sale_id'], 8, "0", STR_PAD_LEFT);
      $saleDateStr = substr((string)$ub['sale_date'], 0, 10);
      $dueDateStr = date('Y-m-d', strtotime($saleDateStr . " +{$defaultTermDays} days"));
      $ins = $conn->prepare(
        "INSERT INTO tblar_invoice (invoice_number, ar_customer_id, sale_id, created_by_user_id, invoice_date, due_date, principal_amount, invoice_amount, balance, status)
         VALUES (:number, :customerId, :saleId, :userId, :saleDate, :dueDate, :principalAmount, :amount, :balance, 'Approved')"
      );
      $ins->execute([
        ":number" => $invNumber,
        ":customerId" => $ub['ar_customer_id'],
        ":saleId" => $ub['sale_id'],
        ":userId" => $ub['cashier_user_id'],
        ":saleDate" => $saleDateStr,
        ":dueDate" => $dueDateStr,
        ":principalAmount" => $ub['total_amount'],
        ":amount" => $ub['total_amount'],
        ":balance" => $ub['total_amount']
      ]);
    }

    $sql = "SELECT i.ar_invoice_id, i.invoice_number, i.invoice_date, i.due_date,
                   COALESCE(i.principal_amount, i.invoice_amount) AS principal_amount,
                   i.invoice_amount, i.balance, i.status, c.customer_name, c.ar_customer_id,
                   CASE
                     WHEN COALESCE(i.balance, 0) <= 0 THEN 'Paid'
                     WHEN i.due_date IS NULL THEN 'No due date'
                     WHEN i.due_date < CURRENT_DATE THEN 'Overdue'
                     WHEN i.due_date = CURRENT_DATE THEN 'Due today'
                     ELSE 'Current'
                   END AS collection_status
            FROM tblar_invoice i
            INNER JOIN tblar_customers c ON c.ar_customer_id = i.ar_customer_id
            WHERE i.status <> 'Pending'
            ORDER BY i.ar_invoice_id DESC";
    $rows = $conn->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    $todayTs = strtotime(date('Y-m-d'));
    foreach ($rows as &$r) {
      $bal = (float)($r['balance'] ?? 0);
      $daysOverdue = 0;
      if ($bal > 0 && !empty($r['due_date'])) {
        $dueTs = strtotime(substr((string)$r['due_date'], 0, 10));
        if ($dueTs && $todayTs > $dueTs) {
          $daysOverdue = (int)floor(($todayTs - $dueTs) / 86400);
        }
      }
      $r['days_overdue'] = $daysOverdue;
      $r['aging_bucket'] = computeAgingBucket($bal, $daysOverdue);
    }
    unset($r);
    return json_encode($rows);
  }

  function paymentAmountToCents($value){
    if (!is_string($value) && !is_int($value) && !is_float($value)) {
      return null;
    }
    $amount = (string)$value;
    if (!preg_match('/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/', $amount)) {
      return null;
    }
    [$whole, $fraction] = array_pad(explode('.', $amount, 2), 2, '');
    return ((int)$whole * 100) + (int)str_pad($fraction, 2, '0');
  }

  function validPaymentDate($value){
    if (!is_string($value)) {
      return false;
    }
    $date = DateTime::createFromFormat('!Y-m-d', $value);
    return $date && $date->format('Y-m-d') === $value;
  }

  function insertPayment($json){
    include "connection-pdo.php";
    $data = json_decode($json, true);
    $user = requireLogin();
    $amountCents = is_array($data) ? paymentAmountToCents($data['amount'] ?? null) : null;
    $invoiceId = is_array($data) ? filter_var($data['invoiceId'] ?? null, FILTER_VALIDATE_INT) : false;
    $paymentMethodId = is_array($data) ? filter_var($data['paymentMethodId'] ?? null, FILTER_VALIDATE_INT) : false;
    $paymentDate = is_array($data) ? ($data['paymentDate'] ?? null) : null;
    if ($amountCents === null || $amountCents <= 0 || !$invoiceId || $invoiceId < 1 ||
        !$paymentMethodId || $paymentMethodId < 1 || !validPaymentDate($paymentDate)) {
      http_response_code(422);
      return json_encode(["message" => "Enter a valid invoice, payment date, positive amount, and payment method."]);
    }
    $amount = intdiv($amountCents, 100) . "." . str_pad((string)($amountCents % 100), 2, '0', STR_PAD_LEFT);

    try {
      $conn->beginTransaction();
      $invoiceStmt = $conn->prepare(
        "SELECT balance, status FROM tblar_invoice
         WHERE ar_invoice_id = :invoiceId AND status <> 'Pending' FOR UPDATE"
      );
      $invoiceStmt->execute([":invoiceId" => $invoiceId]);
      $invoice = $invoiceStmt->fetch(PDO::FETCH_ASSOC);
      $balanceCents = $invoice ? paymentAmountToCents((string)$invoice['balance']) : null;
      if ($balanceCents === null || $balanceCents <= 0 || $amountCents > $balanceCents) {
        $conn->rollBack();
        http_response_code(422);
        return json_encode(["message" => "Payment amount cannot exceed the invoice balance."]);
      }

      $methodStmt = $conn->prepare(
        "SELECT payment_method_id FROM tblpayment_method
         WHERE payment_method_id = :methodId AND is_active = 1"
      );
      $methodStmt->execute([":methodId" => $paymentMethodId]);
      if (!$methodStmt->fetchColumn()) {
        $conn->rollBack();
        http_response_code(422);
        return json_encode(["message" => "Select a valid active payment method."]);
      }

      $referenceNumber = "PAY-" . date("Ymd") . "-" . bin2hex(random_bytes(8));
      $headerStmt = $conn->prepare(
        "INSERT INTO tblpayment_header
          (payment_date, amount, payment_method_id, processed_by_user_id, reference_number, notes)
         VALUES (:paymentDate, :amount, :paymentMethodId, :processedByUserId, :referenceNumber, :notes)"
      );
      $headerStmt->execute([
        ":paymentDate" => $paymentDate,
        ":amount" => $amount,
        ":paymentMethodId" => $paymentMethodId,
        ":processedByUserId" => $user['user_id'],
        ":referenceNumber" => $referenceNumber,
        ":notes" => $data['notes'] ?? null
      ]);
      $paymentId = (int)$conn->lastInsertId();

      $detailStmt = $conn->prepare(
        "INSERT INTO tblpayment_detail (payment_id, ar_invoice_id, applied_amount, applied_date)
         VALUES (:paymentId, :invoiceId, :amount, :paymentDate)"
      );
      $detailStmt->execute([
        ":paymentId" => $paymentId,
        ":invoiceId" => $invoiceId,
        ":amount" => $amount,
        ":paymentDate" => $paymentDate
      ]);

      $newBalanceCents = $balanceCents - $amountCents;
      $newBalance = intdiv($newBalanceCents, 100) . "." . str_pad((string)($newBalanceCents % 100), 2, '0', STR_PAD_LEFT);
      $status = $newBalanceCents === 0 ? "Paid" : "Partially Paid";
      $updateStmt = $conn->prepare(
        "UPDATE tblar_invoice SET balance = :balance, status = :status
         WHERE ar_invoice_id = :invoiceId"
      );
      $updateStmt->execute([
        ":balance" => $newBalance,
        ":status" => $status,
        ":invoiceId" => $invoiceId
      ]);
      $conn->commit();
      return json_encode([
        "returnValue" => 1,
        "paymentId" => $paymentId,
        "referenceNumber" => $referenceNumber,
        "invoiceStatus" => $status,
        "remainingBalance" => $newBalance
      ]);
    } catch (PDOException $e) {
      if ($conn->inTransaction()) {
        $conn->rollBack();
      }
      error_log("Unable to save payment: " . $e->getMessage());
      http_response_code(500);
      return json_encode(["message" => "Unable to save payment."]);
    }
  }

  function previewFifoAllocation($json) {
    include "connection-pdo.php";
    $data = json_decode($json, true) ?: [];
    $customerId = filter_var($data['customerId'] ?? ($data['ar_customer_id'] ?? null), FILTER_VALIDATE_INT);
    $amountCents = paymentAmountToCents($data['amount'] ?? null);

    if (!$customerId || $customerId < 1 || $amountCents === null || $amountCents <= 0) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Please select an AR customer and enter a valid positive payment amount."]);
    }

    $stmt = $conn->prepare(
      "SELECT ar_invoice_id, invoice_number, invoice_date, due_date, invoice_amount, balance, status
       FROM tblar_invoice
       WHERE ar_customer_id = :customerId AND COALESCE(balance, 0) > 0 AND status <> 'Pending'
       ORDER BY invoice_date ASC, ar_invoice_id ASC"
    );
    $stmt->execute([":customerId" => $customerId]);
    $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($invoices)) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "This customer has no outstanding unpaid invoices."]);
    }

    $remainingPaymentCents = $amountCents;
    $allocations = [];
    $totalDebtCents = 0;

    foreach ($invoices as $inv) {
      $invBalCents = paymentAmountToCents((string)$inv['balance']) ?: 0;
      $totalDebtCents += $invBalCents;

      if ($remainingPaymentCents > 0) {
        $applyCents = min($remainingPaymentCents, $invBalCents);
        $newBalCents = $invBalCents - $applyCents;
        $remainingPaymentCents -= $applyCents;

        $allocations[] = [
          "invoice_id" => (int)$inv['ar_invoice_id'],
          "invoice_number" => $inv['invoice_number'],
          "invoice_date" => $inv['invoice_date'],
          "due_date" => $inv['due_date'],
          "invoice_amount" => (float)$inv['invoice_amount'],
          "current_balance" => (float)number_format($invBalCents / 100, 2, '.', ''),
          "amount_applied" => (float)number_format($applyCents / 100, 2, '.', ''),
          "remaining_balance" => (float)number_format($newBalCents / 100, 2, '.', ''),
          "resulting_status" => $newBalCents === 0 ? "Paid" : "Partially Paid"
        ];
      } else {
        $allocations[] = [
          "invoice_id" => (int)$inv['ar_invoice_id'],
          "invoice_number" => $inv['invoice_number'],
          "invoice_date" => $inv['invoice_date'],
          "due_date" => $inv['due_date'],
          "invoice_amount" => (float)$inv['invoice_amount'],
          "current_balance" => (float)number_format($invBalCents / 100, 2, '.', ''),
          "amount_applied" => 0.00,
          "remaining_balance" => (float)number_format($invBalCents / 100, 2, '.', ''),
          "resulting_status" => $inv['status']
        ];
      }
    }

    $totalAppliedCents = $amountCents - $remainingPaymentCents;
    $newTotalDebtCents = max(0, $totalDebtCents - $totalAppliedCents);

    return json_encode([
      "returnValue" => 1,
      "customer_id" => $customerId,
      "total_payment_entered" => (float)number_format($amountCents / 100, 2, '.', ''),
      "total_applied" => (float)number_format($totalAppliedCents / 100, 2, '.', ''),
      "unallocated_amount" => (float)number_format($remainingPaymentCents / 100, 2, '.', ''),
      "total_current_debt" => (float)number_format($totalDebtCents / 100, 2, '.', ''),
      "new_customer_debt" => (float)number_format($newTotalDebtCents / 100, 2, '.', ''),
      "allocations" => $allocations
    ]);
  }

  function insertFifoPayment($json, $user) {
    include "connection-pdo.php";
    $data = json_decode($json, true) ?: [];
    $customerId = filter_var($data['customerId'] ?? ($data['ar_customer_id'] ?? null), FILTER_VALIDATE_INT);
    $amountCents = paymentAmountToCents($data['amount'] ?? null);
    $paymentMethodId = filter_var($data['paymentMethodId'] ?? null, FILTER_VALIDATE_INT);
    $paymentDate = $data['paymentDate'] ?? date('Y-m-d');
    $notes = trim($data['notes'] ?? '');

    if (!$customerId || $customerId < 1 || $amountCents === null || $amountCents <= 0 ||
        !$paymentMethodId || $paymentMethodId < 1 || !validPaymentDate($paymentDate)) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Please provide a valid customer, positive payment amount, payment method, and payment date."]);
    }

    try {
      $conn->beginTransaction();

      $methodStmt = $conn->prepare("SELECT payment_method_id, method_name FROM tblpayment_method WHERE payment_method_id = :mid AND is_active = 1");
      $methodStmt->execute([":mid" => $paymentMethodId]);
      $method = $methodStmt->fetch(PDO::FETCH_ASSOC);
      if (!$method) {
        $conn->rollBack();
        http_response_code(422);
        return json_encode(["returnValue" => 0, "message" => "Invalid payment method selected."]);
      }

      $invoiceStmt = $conn->prepare(
        "SELECT ar_invoice_id, invoice_number, invoice_date, due_date, invoice_amount, balance, status
         FROM tblar_invoice
         WHERE ar_customer_id = :customerId AND COALESCE(balance, 0) > 0 AND status <> 'Pending'
         ORDER BY invoice_date ASC, ar_invoice_id ASC FOR UPDATE"
      );
      $invoiceStmt->execute([":customerId" => $customerId]);
      $invoices = $invoiceStmt->fetchAll(PDO::FETCH_ASSOC);

      if (empty($invoices)) {
        $conn->rollBack();
        http_response_code(422);
        return json_encode(["returnValue" => 0, "message" => "Customer has no outstanding unpaid invoices."]);
      }

      $totalDebtCents = 0;
      foreach ($invoices as $inv) {
        $totalDebtCents += paymentAmountToCents((string)$inv['balance']) ?: 0;
      }

      $remainingPaymentCents = $amountCents;
      $totalAppliedCents = min($amountCents, $totalDebtCents);
      $paymentTotalFormatted = number_format($totalAppliedCents / 100, 2, '.', '');

      $referenceNumber = "PAY-" . date("Ymd") . "-" . bin2hex(random_bytes(8));
      $headerStmt = $conn->prepare(
        "INSERT INTO tblpayment_header (payment_date, amount, payment_method_id, processed_by_user_id, reference_number, notes)
         VALUES (:paymentDate, :amount, :paymentMethodId, :processedByUserId, :referenceNumber, :notes)"
      );
      $headerStmt->execute([
        ":paymentDate" => $paymentDate,
        ":amount" => $paymentTotalFormatted,
        ":paymentMethodId" => $paymentMethodId,
        ":processedByUserId" => $user['user_id'],
        ":referenceNumber" => $referenceNumber,
        ":notes" => $notes ?: "FIFO Allocation Settlement"
      ]);
      $paymentId = (int)$conn->lastInsertId();

      $allocatedRecords = [];
      $allocStmt = $conn->prepare(
        "INSERT INTO tblpayment_allocations (payment_id, invoice_id, amount_applied, created_at)
         VALUES (:paymentId, :invoiceId, :amountApplied, CURRENT_TIMESTAMP)"
      );
      $detailStmt = $conn->prepare(
        "INSERT INTO tblpayment_detail (payment_id, ar_invoice_id, applied_amount, applied_date)
         VALUES (:paymentId, :invoiceId, :amountApplied, :paymentDate)"
      );
      $updateInvStmt = $conn->prepare(
        "UPDATE tblar_invoice SET balance = :balance, status = :status WHERE ar_invoice_id = :invoiceId"
      );

      foreach ($invoices as $inv) {
        if ($remainingPaymentCents <= 0) break;
        $invBalCents = paymentAmountToCents((string)$inv['balance']) ?: 0;
        $applyCents = min($remainingPaymentCents, $invBalCents);
        $newBalCents = $invBalCents - $applyCents;
        $remainingPaymentCents -= $applyCents;

        $applyFormatted = number_format($applyCents / 100, 2, '.', '');
        $newBalFormatted = number_format($newBalCents / 100, 2, '.', '');
        $status = $newBalCents === 0 ? "Paid" : "Partially Paid";

        $allocStmt->execute([
          ":paymentId" => $paymentId,
          ":invoiceId" => $inv['ar_invoice_id'],
          ":amountApplied" => $applyFormatted
        ]);

        $detailStmt->execute([
          ":paymentId" => $paymentId,
          ":invoiceId" => $inv['ar_invoice_id'],
          ":amountApplied" => $applyFormatted,
          ":paymentDate" => $paymentDate
        ]);

        $updateInvStmt->execute([
          ":balance" => $newBalFormatted,
          ":status" => $status,
          ":invoiceId" => $inv['ar_invoice_id']
        ]);

        $allocatedRecords[] = [
          "invoice_id" => (int)$inv['ar_invoice_id'],
          "invoice_number" => $inv['invoice_number'],
          "applied_amount" => (float)$applyFormatted,
          "remaining_balance" => (float)$newBalFormatted,
          "status" => $status
        ];
      }

      $conn->commit();

      $expStmt = $conn->prepare(
        "SELECT c.ar_customer_id, c.customer_name, c.credit_limit,
                COALESCE(i.invoice_balance, 0) AS credit_exposure,
                c.credit_limit - COALESCE(i.invoice_balance, 0) AS available_credit
         FROM tblar_customers c
         LEFT JOIN (
           SELECT ar_customer_id, SUM(balance) AS invoice_balance FROM tblar_invoice
           WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0 GROUP BY ar_customer_id
         ) i ON i.ar_customer_id=c.ar_customer_id
         WHERE c.ar_customer_id = :cid"
      );
      $expStmt->execute([":cid" => $customerId]);
      $updatedCustomer = $expStmt->fetch(PDO::FETCH_ASSOC);

      return json_encode([
        "returnValue" => 1,
        "paymentId" => $paymentId,
        "referenceNumber" => $referenceNumber,
        "totalApplied" => (float)$paymentTotalFormatted,
        "allocations" => $allocatedRecords,
        "customer" => $updatedCustomer
      ]);

    } catch (Throwable $e) {
      if ($conn->inTransaction()) $conn->rollBack();
      error_log("FIFO payment failure: " . $e->getMessage());
      http_response_code(500);
      return json_encode(["returnValue" => 0, "message" => "Unable to process FIFO payment: " . $e->getMessage()]);
    }
  }

  $operation = $_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['operation'] ?? '') : ($_POST['operation'] ?? '');
  $json = $_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['json'] ?? '') : ($_POST['json'] ?? '');
  if ($json === '' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawBody = file_get_contents('php://input');
    if ($rawBody) {
      $decoded = json_decode($rawBody, true);
      if (is_array($decoded)) {
        if (empty($operation) && !empty($decoded['operation'])) {
          $operation = $decoded['operation'];
        }
        $json = isset($decoded['json']) && is_string($decoded['json']) ? $decoded['json'] : $rawBody;
      }
    }
  }
  switch ($operation) {
    case "getPaymentFormData":
      $user = requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      echo getPaymentFormData($user);
      break;
    case "getAllPayments":
      requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      echo getAllPayments();
      break;
    case "getAllInvoices":
      requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      echo getAllInvoices();
      break;
    case "previewFifoAllocation":
      requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      echo previewFifoAllocation($json);
      break;
    case "insertFifoPayment":
      $user = requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      echo insertFifoPayment($json, $user);
      break;
    case "insertPayment":
      requireRoles(["Accounts Receivable Staff", "Admin", "Manager", "Cashier", "Supervisor"]);
      echo insertPayment($json);
      break;
    case "getPaymentAllocations":
      requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      $pid = $_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['payment_id'] ?? ($_GET['id'] ?? null)) : ($_POST['payment_id'] ?? null);
      echo getPaymentAllocations($pid);
      break;
    case "getOverduePolicy":
      requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      include "connection-pdo.php";
      echo json_encode(["returnValue" => 1, "policy" => getOverduePolicySettings($conn)]);
      break;
    case "saveOverduePolicy":
      requireRoles(["Admin", "Manager", "Supervisor", "Accounts Receivable Staff"]);
      echo saveOverduePolicy($json);
      break;
    case "previewOverdueCharge":
      requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      echo previewOverdueCharge($json);
      break;
    case "applyOverdueCharge":
      $user = requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      echo applyOverdueCharge($json, $user);
      break;
    case "createArMemo":
      $user = requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      echo createArMemo($json, $user);
      break;
    case "getLedgerEntries":
      requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      $cid = $_GET['customerId'] ?? ($_POST['customerId'] ?? null);
      echo getLedgerEntries($cid);
      break;
    case "getCustomerLedger":
      requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      $cid = $_GET['customerId'] ?? ($_POST['customerId'] ?? ($data['customerId'] ?? ($data['ar_customer_id'] ?? null)));
      $acctType = $_GET['accountType'] ?? ($_POST['accountType'] ?? ($data['accountType'] ?? 'AR'));
      echo getCustomerLedger($cid, $acctType);
      break;
    case "getCustomerArHistory":
      requireRoles(["Admin", "Cashier", "Accounts Receivable Staff", "Manager", "Supervisor"]);
      $cid = $_GET['customerId'] ?? ($_POST['customerId'] ?? null);
      echo getCustomerArHistory($cid);
      break;
    default:
      http_response_code(400);
      echo json_encode(["message" => "Invalid payment operation."]);
  }
?>
