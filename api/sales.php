<?php
require_once "auth-lib.php";
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

function getMinOpeningFloat($conn) {
  try {
    $stmt = $conn->prepare("SELECT setting_value FROM tblsystem_settings WHERE setting_key = 'min_opening_float'");
    $stmt->execute();
    $val = $stmt->fetchColumn();
    if ($val !== false && is_numeric($val) && (float)$val >= 0) {
      return round((float)$val, 2);
    }
  } catch (Throwable $e) {
    // Table may not exist yet before migration
  }
  return 0.00;
}

function getCustomDiscountThresholds($conn) {
  $pct = 10.0;
  $amt = 100.00;
  try {
    $stmt = $conn->query("SELECT setting_key, setting_value FROM tblsystem_settings WHERE setting_key IN ('custom_discount_threshold_pct', 'custom_discount_threshold_amt')");
    if ($stmt) {
      foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if ($row['setting_key'] === 'custom_discount_threshold_pct' && is_numeric($row['setting_value'])) {
          $pct = round((float)$row['setting_value'], 2);
        } elseif ($row['setting_key'] === 'custom_discount_threshold_amt' && is_numeric($row['setting_value'])) {
          $amt = round((float)$row['setting_value'], 2);
        }
      }
    }
  } catch (Throwable $e) {
    // Fallback to defaults
  }
  return ['pct' => $pct, 'amt' => $amt];
}

function getArOverduePolicySettings($conn) {
  $policy = [
    'default_term_days' => 30,
    'interest_mode' => 'fixed',
    'interest_rate_pct' => 5.00,
    'penalty_mode' => 'flat',
    'penalty_value' => 50.00,
    'block_overdue_accounts' => 1
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

function resolveSessionTerminalId($conn, $user = null) {
  if (!$user) {
    $user = currentUser();
  }
  // If user is a Cashier and has an assigned_terminal_id, strictly enforce it
  if ($user && strtolower(trim($user['role_name'] ?? '')) === 'cashier' && !empty($user['assigned_terminal_id'])) {
    $assignedId = (int)$user['assigned_terminal_id'];
    $stmt = $conn->prepare("SELECT pos_terminal_id FROM tblpos_terminals WHERE pos_terminal_id = :tid");
    $stmt->execute([":tid" => $assignedId]);
    if ($stmt->fetchColumn()) {
      $_SESSION['pos_terminal_id'] = $assignedId;
      return $assignedId;
    }
  }
  $terminalId = filter_var($_SESSION['pos_terminal_id'] ?? null, FILTER_VALIDATE_INT);
  if ($terminalId && $terminalId > 0) {
    $stmt = $conn->prepare("SELECT pos_terminal_id FROM tblpos_terminals WHERE pos_terminal_id = :tid");
    $stmt->execute([":tid" => $terminalId]);
    if ($stmt->fetchColumn()) {
      return (int)$terminalId;
    }
  }
  $detected = detectClientTerminal($conn);
  if ($detected && !empty($detected['pos_terminal_id'])) {
    $_SESSION['pos_terminal_id'] = (int)$detected['pos_terminal_id'];
    return (int)$detected['pos_terminal_id'];
  }
  $terminalRow = $conn->query("SELECT pos_terminal_id FROM tblpos_terminals ORDER BY pos_terminal_id ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
  if ($terminalRow) {
    $_SESSION['pos_terminal_id'] = (int)$terminalRow['pos_terminal_id'];
    return (int)$terminalRow['pos_terminal_id'];
  }
  return null;
}

function findOpenShift($conn, $userId, $terminalId) {
  if (!$userId || !$terminalId) {
    return null;
  }
  // Auto-close any leftover stale shifts from prior calendar dates
  try {
    $conn->exec("UPDATE tblshifts SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE status = 'open' AND CAST(opened_at AS DATE) < CURRENT_DATE");
  } catch (Throwable $e) {
    // Ignore if table not migrated
  }
  $stmt = $conn->prepare(
    "SELECT shift_id, user_id, terminal_id, opening_cash, current_float, opened_at, status
     FROM tblshifts
     WHERE user_id = :userId AND terminal_id = :terminalId AND status = 'open'
     ORDER BY shift_id DESC LIMIT 1"
  );
  $stmt->execute([":userId" => $userId, ":terminalId" => $terminalId]);
  return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function getFormData($user) {
  include "connection-pdo.php";
  $selectedTerminal = null;
  $terminalId = resolveSessionTerminalId($conn, $user);
  if ($terminalId) {
    $terminalStmt = $conn->prepare(
      "SELECT pos_terminal_id, terminal_name FROM tblpos_terminals WHERE pos_terminal_id = :terminalId"
    );
    $terminalStmt->execute([":terminalId" => $terminalId]);
    $selectedTerminal = $terminalStmt->fetch(PDO::FETCH_ASSOC) ?: null;
  }

  $rawProducts = $conn->query(
    "SELECT p.product_id, p.barcode, p.product_name, p.price, COALESCE(p.stock_quantity, 100) AS stock_quantity,
            COALESCE(pr.discount_rate, 0) AS promo_rate,
            pr.promo_id, pr.promo_name
     FROM tblproducts p
     LEFT JOIN tblpromo pr ON pr.promo_id = (
       SELECT pr2.promo_id
       FROM tblproduct_promo pp2
       INNER JOIN tblpromo pr2 ON pr2.promo_id = pp2.promo_id
       WHERE pp2.product_id = p.product_id AND pr2.is_active = 1
         AND (pr2.start_date IS NULL OR pr2.start_date <= CURRENT_DATE)
         AND (pr2.end_date IS NULL OR pr2.end_date >= CURRENT_DATE)
       ORDER BY pr2.discount_rate DESC, pr2.promo_id DESC
       LIMIT 1
     )
     WHERE p.is_active = 1 ORDER BY p.product_name"
  )->fetchAll(PDO::FETCH_ASSOC);

  foreach ($rawProducts as &$prod) {
    if (empty($prod['barcode'])) {
      $prod['barcode'] = str_pad((string)$prod['product_id'], 8, '0', STR_PAD_LEFT);
    }
  }
  unset($prod);

  $activeShift = $terminalId ? findOpenShift($conn, $user['user_id'], $terminalId) : null;
  $minOpeningFloat = getMinOpeningFloat($conn);
  $discThresholds = getCustomDiscountThresholds($conn);
  $arPolicy = getArOverduePolicySettings($conn);

  return json_encode([
    "products" => $rawProducts,
    "selectedTerminal" => $selectedTerminal,
    "activeShift" => $activeShift,
    "minOpeningFloat" => $minOpeningFloat,
    "customDiscountThresholdPct" => $discThresholds['pct'],
    "customDiscountThresholdAmt" => $discThresholds['amt'],
    "arOverduePolicy" => $arPolicy,
    "paymentMethods" => $conn->query(
      "SELECT payment_method_id, method_name
       FROM tblpayment_method
       WHERE is_active = 1
       ORDER BY method_name"
    )->fetchAll(PDO::FETCH_ASSOC),
    "customers" => $conn->query(
      "SELECT c.ar_customer_id, c.customer_name, c.credit_limit,
              COALESCE(i.invoice_balance, 0) + COALESCE(s.pending_balance, 0) AS credit_exposure,
              c.credit_limit - COALESCE(i.invoice_balance, 0) - COALESCE(s.pending_balance, 0) AS available_credit,
              COALESCE(ov.overdue_count, 0) AS overdue_invoice_count,
              COALESCE(ov.overdue_balance, 0) AS overdue_balance
       FROM tblar_customers c
       LEFT JOIN (
         SELECT ar_customer_id, SUM(balance) AS invoice_balance FROM tblar_invoice
         WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0 GROUP BY ar_customer_id
       ) i ON i.ar_customer_id = c.ar_customer_id
       LEFT JOIN (
         SELECT ar_customer_id, COUNT(*) AS overdue_count, SUM(balance) AS overdue_balance FROM tblar_invoice
         WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0 AND due_date < CURRENT_DATE GROUP BY ar_customer_id
       ) ov ON ov.ar_customer_id = c.ar_customer_id
       LEFT JOIN (
         SELECT s.ar_customer_id, SUM(s.total_amount) AS pending_balance FROM tblsales s
         WHERE s.sale_type = 'AR' AND s.ar_customer_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM tblar_invoice ai WHERE ai.sale_id = s.sale_id)
         GROUP BY s.ar_customer_id
       ) s ON s.ar_customer_id = c.ar_customer_id
       WHERE c.is_active = 1 ORDER BY c.customer_name"
    )->fetchAll(PDO::FETCH_ASSOC),
    "sukiCards" => $conn->query(
      "SELECT s.sku_card_id, s.ar_customer_id, s.card_number, s.points_balance
       FROM tblsku_card s
       INNER JOIN tblar_customers c ON c.ar_customer_id = s.ar_customer_id AND c.is_active = 1
       WHERE s.is_active = 1 AND (s.expiry_date IS NULL OR s.expiry_date >= CURRENT_DATE)
       ORDER BY s.ar_customer_id, s.issued_date DESC, s.sku_card_id DESC"
    )->fetchAll(PDO::FETCH_ASSOC),
    "promotions" => $conn->query(
      "SELECT promo_id, promo_name, discount_rate
       FROM tblpromo
       WHERE is_active = 1
         AND (start_date IS NULL OR start_date <= CURRENT_DATE)
         AND (end_date IS NULL OR end_date >= CURRENT_DATE)
       ORDER BY promo_name"
    )->fetchAll(PDO::FETCH_ASSOC)
  ]);
}

function getCreditEligibility($customerId) {
  include "connection-pdo.php";
  if ($customerId < 1) {
    http_response_code(422);
    return json_encode(["message" => "A valid AR customer is required."]);
  }
  $arPolicy = getArOverduePolicySettings($conn);
  $stmt = $conn->prepare(
    "SELECT c.ar_customer_id, c.customer_name, c.credit_limit,
            COALESCE(i.invoice_balance, 0) + COALESCE(s.pending_balance, 0) AS credit_exposure,
            c.credit_limit - COALESCE(i.invoice_balance, 0) - COALESCE(s.pending_balance, 0) AS available_credit,
            COALESCE(ov.overdue_count, 0) AS overdue_invoice_count,
            COALESCE(ov.overdue_balance, 0) AS overdue_balance
     FROM tblar_customers c
     LEFT JOIN (
       SELECT ar_customer_id, SUM(balance) AS invoice_balance FROM tblar_invoice
       WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0 GROUP BY ar_customer_id
     ) i ON i.ar_customer_id = c.ar_customer_id
     LEFT JOIN (
       SELECT ar_customer_id, COUNT(*) AS overdue_count, SUM(balance) AS overdue_balance FROM tblar_invoice
       WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0 AND due_date < CURRENT_DATE GROUP BY ar_customer_id
     ) ov ON ov.ar_customer_id = c.ar_customer_id
     LEFT JOIN (
       SELECT s.ar_customer_id, SUM(s.total_amount) AS pending_balance FROM tblsales s
       WHERE s.sale_type = 'AR' AND s.ar_customer_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM tblar_invoice ai WHERE ai.sale_id = s.sale_id)
       GROUP BY s.ar_customer_id
     ) s ON s.ar_customer_id = c.ar_customer_id
     WHERE c.ar_customer_id = :customerId AND c.is_active = 1"
  );
  $stmt->execute([":customerId" => $customerId]);
  $eligibility = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$eligibility) {
    http_response_code(404);
    return json_encode(["message" => "The selected AR customer is not available."]);
  }
  $ovCount = (int)($eligibility['overdue_invoice_count'] ?? 0);
  $eligibility['overdue_invoice_count'] = $ovCount;
  $eligibility['overdue_balance'] = round((float)($eligibility['overdue_balance'] ?? 0), 2);
  $eligibility['block_overdue_accounts'] = (int)$arPolicy['block_overdue_accounts'];
  $eligibility['blocked_by_overdue'] = ($arPolicy['block_overdue_accounts'] && $ovCount > 0) ? 1 : 0;
  $eligibility['default_term_days'] = (int)$arPolicy['default_term_days'];
  return json_encode($eligibility);
}

function getAllSales() {
  include "connection-pdo.php";
  $user = requireLogin();
  $filter = $user['role_name'] === 'Cashier' ? " WHERE s.cashier_user_id = :cashierId" : "";
  $sql = "SELECT s.sale_id, s.sale_date, s.sale_type, s.price, s.tax_total, s.total_amount, s.balance,
                 s.discount_type, s.discount_id_number, s.vat_exempt_sales, s.vat_exempt_amount, s.discount_total,
                 s.custom_discount_mode, s.custom_discount_value,
                 s.shift_id, m.method_name AS payment_method,
                 COALESCE((SELECT SUM(sd.promo_discount) FROM tblsales_detail sd WHERE sd.sale_id = s.sale_id), 0) AS promotion_discount,
                 c.customer_name,
                 t.terminal_name, CONCAT(u.first_name, ' ', u.last_name) AS cashier
          FROM tblsales s
          INNER JOIN tblpos_terminals t ON s.pos_terminal_id = t.pos_terminal_id
          INNER JOIN tblusers u ON s.cashier_user_id = u.user_id
          LEFT JOIN tblar_customers c ON c.ar_customer_id = s.ar_customer_id
          LEFT JOIN tblpayment_method m ON m.payment_method_id = s.payment_method_id
          " . $filter . " ORDER BY s.sale_id DESC";
  $stmt = $conn->prepare($sql);
  if ($user['role_name'] === 'Cashier') {
    $stmt->execute([":cashierId" => $user['user_id']]);
  } else {
    $stmt->execute();
  }
  $sales = $stmt->fetchAll(PDO::FETCH_ASSOC);

  // Attach promotions_applied using standard ANSI SQL (no MySQL GROUP_CONCAT)
  if (!empty($sales)) {
    $promoRows = $conn->query(
      "SELECT DISTINCT sd.sale_id, pr.promo_name
       FROM tblsales_detail sd
       INNER JOIN tblpromo pr ON pr.promo_id = sd.promo_id
       ORDER BY pr.promo_name ASC"
    )->fetchAll(PDO::FETCH_ASSOC);
    $promoMap = [];
    foreach ($promoRows as $prRow) {
      $sid = (int)$prRow['sale_id'];
      $promoMap[$sid][] = $prRow['promo_name'];
    }
    foreach ($sales as &$sRow) {
      $sid = (int)$sRow['sale_id'];
      $sRow['promotions_applied'] = isset($promoMap[$sid]) ? implode(', ', $promoMap[$sid]) : null;
    }
    unset($sRow);
  }

  return json_encode($sales);
}

function getReceipt($saleId) {
  include "connection-pdo.php";
  $user = requireLogin();
  $stmt = $conn->prepare(
    "SELECT s.*, t.terminal_name, CONCAT(u.first_name, ' ', u.last_name) AS cashier,
            c.customer_name, sc.card_number AS suki_card_number, m.method_name AS payment_method,
            ai.invoice_number, ai.due_date
     FROM tblsales s
     INNER JOIN tblpos_terminals t ON s.pos_terminal_id = t.pos_terminal_id
     INNER JOIN tblusers u ON s.cashier_user_id = u.user_id
     LEFT JOIN tblar_customers c ON c.ar_customer_id = s.ar_customer_id
     LEFT JOIN tblpayment_method m ON m.payment_method_id = s.payment_method_id
     LEFT JOIN tblsku_card sc ON sc.sku_card_id = s.suki_card_id
     LEFT JOIN tblar_invoice ai ON ai.sale_id = s.sale_id
     WHERE s.sale_id = :saleId AND (:isCashier = 0 OR s.cashier_user_id = :userId)"
  );
  $stmt->execute([
    ":saleId" => $saleId,
    ":isCashier" => $user['role_name'] === 'Cashier' ? 1 : 0,
    ":userId" => $user['user_id']
  ]);
  $sale = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$sale) {
    http_response_code(404);
    return json_encode(["message" => "Sale not found."]);
  }
  $detail = $conn->prepare(
    "SELECT d.*, p.product_name, pr.promo_name
     FROM tblsales_detail d
     INNER JOIN tblproducts p ON d.product_id = p.product_id
     LEFT JOIN tblpromo pr ON pr.promo_id = d.promo_id
     WHERE d.sale_id = :saleId
     ORDER BY d.sales_detail_id"
  );
  $detail->execute([":saleId" => $saleId]);
  return json_encode(["sale" => $sale, "items" => $detail->fetchAll(PDO::FETCH_ASSOC)]);
}

function createSale($json) {
  include "connection-pdo.php";
  if (!empty($_SESSION['shift_closed_lock'])) {
    http_response_code(403);
    return json_encode(["returnValue" => 0, "message" => "Session is locked following End of Shift. Please log in again."]);
  }
  $data = json_decode($json, true);
  if (!is_array($data)) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "A valid sale request is required."]);
  }
  $items = $data['items'] ?? [];
  if (!is_array($items) || !$items || empty($data['saleType'])) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "Sale type and at least one item are required."]);
  }
  if (!in_array($data['saleType'], ['Cash', 'AR'], true)) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "Sale type must be Cash or AR."]);
  }
  $isAr = $data['saleType'] === 'AR';
  $paymentMethodId = is_array($data)
    ? filter_var($data['paymentMethodId'] ?? null, FILTER_VALIDATE_INT)
    : false;
  if ((!$isAr && (!$paymentMethodId || $paymentMethodId < 1)) ||
      ($isAr && !empty($data['paymentMethodId']))) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => $isAr
      ? "AR credit sales are paid through the AR payment process."
      : "Select an active payment method for this cash sale."]);
  }
  $user = requireLogin();
  $data['cashierUserId'] = $user['user_id'];
  if ($user['role_name'] === 'Cashier') {
    foreach ($items as $item) {
      if (!empty($item['discount']) && (float)$item['discount'] > 0) {
        http_response_code(403);
        return json_encode(["returnValue" => 0, "message" => "Cashiers are not permitted to create or modify custom discounts."]);
      }
    }
  }
  $terminalId = filter_var($_SESSION['pos_terminal_id'] ?? null, FILTER_VALIDATE_INT);
  if (!$terminalId || $terminalId < 1) {
    if (in_array($user['role_name'], ['Admin', 'Manager', 'Supervisor'], true)) {
      $defaultTerminalStmt = $conn->query("SELECT pos_terminal_id FROM tblpos_terminals ORDER BY pos_terminal_id ASC LIMIT 1");
      $terminalId = $defaultTerminalStmt ? (int)$defaultTerminalStmt->fetchColumn() : null;
    }
  }
  if (!$terminalId || $terminalId < 1) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "Choose a POS terminal after signing in before recording a sale."]);
  }

  // WP-1 1A.4 Server-side enforcement: Reject transactions when session has no open shift with opening float
  $activeShift = findOpenShift($conn, $user['user_id'], $terminalId);
  $minFloat = getMinOpeningFloat($conn);
  if (!$activeShift || $activeShift['opening_cash'] === null || (float)$activeShift['opening_cash'] < $minFloat) {
    http_response_code(403);
    return json_encode([
      "returnValue" => 0,
      "message" => "Shift not open: A mandatory beginning cash float must be recorded before processing any sales transaction."
    ]);
  }
  $activeShiftId = (int)$activeShift['shift_id'];

  $sukiStatus = 'None';
  $sukiPointsBalance = null;
  $sukiCardId = null;
  $creditLimit = null;
  if (!$isAr) {
    $requestedSukiStatus = $data['sukiCardStatus'] ?? '';
    if (!in_array($requestedSukiStatus, ['Has', 'None'], true)) {
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Select Has or None for the SUKI card."]);
    }
    $sukiStatus = $requestedSukiStatus;
    $sukiPointsBalance = 0;
  }
  if ($isAr && empty($data['customerId'])) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "An AR customer is required for credit sales."]);
  }
  $customerId = $isAr ? (int)$data['customerId'] : null;
  $requestedSukiCardId = filter_var($data['sukiCardId'] ?? null, FILTER_VALIDATE_INT);
  if (!$isAr && !empty($data['sukiCardId']) && (!$requestedSukiCardId || $requestedSukiCardId < 1)) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "Select a valid registered SUKI card."]);
  }
  if (!$isAr && $sukiStatus === 'None' && !empty($data['sukiCardId'])) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "A registered SUKI card can only be selected when the customer has a card."]);
  }
  try {
    $conn->beginTransaction();
    if (!$isAr) {
      $methodStmt = $conn->prepare(
        "SELECT payment_method_id FROM tblpayment_method
         WHERE payment_method_id = :methodId AND is_active = 1 FOR UPDATE"
      );
      $methodStmt->execute([":methodId" => $paymentMethodId]);
      if (!$methodStmt->fetchColumn()) {
        throw new RuntimeException("Select a valid active payment method.");
      }
    }
    $terminalStmt = $conn->prepare(
      "SELECT pos_terminal_id FROM tblpos_terminals WHERE pos_terminal_id = :terminalId FOR UPDATE"
    );
    $terminalStmt->execute([":terminalId" => $terminalId]);
    if (!$terminalStmt->fetchColumn()) {
      throw new RuntimeException("You are not assigned to the selected POS terminal.");
    }
    if (!$isAr && $sukiStatus === 'Has' && $requestedSukiCardId) {
      $cardStmt = $conn->prepare(
        "SELECT s.sku_card_id, s.ar_customer_id, s.points_balance
         FROM tblsku_card s
         INNER JOIN tblar_customers c ON c.ar_customer_id = s.ar_customer_id AND c.is_active = 1
         WHERE s.sku_card_id = :cardId AND s.is_active = 1
           AND (s.expiry_date IS NULL OR s.expiry_date >= CURRENT_DATE)
         FOR UPDATE"
      );
      $cardStmt->execute([":cardId" => $requestedSukiCardId]);
      $card = $cardStmt->fetch(PDO::FETCH_ASSOC);
      if (!$card) {
        throw new RuntimeException("The selected SUKI card is no longer active.");
      }
      $sukiCardId = (int)$card['sku_card_id'];
      $customerId = (int)$card['ar_customer_id'];
      $sukiPointsBalance = (float)($card['points_balance'] ?? 0);
    }
    if ($isAr) {
      $customerStmt = $conn->prepare("SELECT ar_customer_id, credit_limit FROM tblar_customers WHERE ar_customer_id = :customerId AND is_active = 1 FOR UPDATE");
      $customerStmt->execute([":customerId" => $customerId]);
      $customer = $customerStmt->fetch(PDO::FETCH_ASSOC);
      if (!$customer) {
        throw new RuntimeException("The selected AR customer is not available.");
      }
      $creditLimit = (float)$customer['credit_limit'];
      $cardStmt = $conn->prepare("SELECT s.sku_card_id, s.points_balance FROM tblsku_card s WHERE s.ar_customer_id = :customerId AND s.is_active = 1 AND (s.expiry_date IS NULL OR s.expiry_date >= CURRENT_DATE) ORDER BY s.issued_date DESC, s.sku_card_id DESC FOR UPDATE");
      $cardStmt->execute([":customerId" => $customerId]);
      $customerCards = $cardStmt->fetchAll(PDO::FETCH_ASSOC);
      if (count($customerCards) > 1) {
        throw new RuntimeException("Multiple active SUKI cards are linked to this customer. Ask AR Staff to resolve this before completing the sale.");
      }
      if ($customerCards) {
        $sukiCardId = (int)$customerCards[0]['sku_card_id'];
        $sukiStatus = 'Has';
        $sukiPointsBalance = $customerCards[0]['points_balance'] === null ? 0 : (float)$customerCards[0]['points_balance'];
      }
    }
    $subtotal = 0;
    $detailRows = [];
    foreach ($items as $item) {
      $productStmt = $conn->prepare(
        "SELECT p.price, COALESCE(pr.discount_rate, 0) AS promo_rate, pr.promo_id, pr.promo_name
         FROM tblproducts p
         LEFT JOIN tblpromo pr ON pr.promo_id = (
           SELECT pr2.promo_id
           FROM tblproduct_promo pp2
           INNER JOIN tblpromo pr2 ON pr2.promo_id = pp2.promo_id
           WHERE pp2.product_id = p.product_id AND pr2.is_active = 1
             AND (pr2.start_date IS NULL OR pr2.start_date <= CURRENT_DATE)
             AND (pr2.end_date IS NULL OR pr2.end_date >= CURRENT_DATE)
           ORDER BY pr2.discount_rate DESC, pr2.promo_id DESC
           LIMIT 1
         )
         WHERE p.product_id = :productId AND p.is_active = 1"
      );
      $productStmt->execute([":productId" => $item['productId']]);
      $product = $productStmt->fetch(PDO::FETCH_ASSOC);
      if (!$product) {
        throw new RuntimeException("Selected product is unavailable.");
      }
      $unitPrice = (float)$product['price'];
      $quantity = filter_var($item['quantity'] ?? null, FILTER_VALIDATE_FLOAT);
      if (!$quantity || $quantity <= 0) {
        throw new RuntimeException("Item quantities must be positive numbers.");
      }
      $promoRate = (float)($product['promo_rate'] ?? 0);
      $promoId = !empty($product['promo_id']) ? (int)$product['promo_id'] : null;
      $grossLine = round($quantity * $unitPrice, 2);
      $promoDiscount = $promoRate > 0 ? round(($grossLine * $promoRate) / 100, 2) : 0.00;
      $lineTotal = round($grossLine - $promoDiscount, 2);
      $subtotal += $lineTotal;
      $detailRows[] = [$item['productId'], $promoId, $quantity, $unitPrice, 0.00, $promoDiscount, $lineTotal, $unitPrice];
    }
    $grossAfterPromo = round($subtotal, 2);
    $discountType = strtolower(trim($data['discountType'] ?? 'none'));
    if (!in_array($discountType, ['none', 'senior', 'pwd', 'custom'], true)) {
      $discountType = 'none';
    }
    $discountIdNumber = trim($data['discountIdNumber'] ?? '');
    $customDiscountMode = strtolower(trim($data['customDiscountMode'] ?? 'percent'));
    if (!in_array($customDiscountMode, ['percent', 'fixed'], true)) {
      $customDiscountMode = 'percent';
    }
    $customDiscountValue = max(0.0, (float)($data['customDiscountValue'] ?? 0));
    $discountSupervisorId = filter_var($data['discountSupervisorId'] ?? null, FILTER_VALIDATE_INT) ?: null;

    $vatExemptSales = 0.00;
    $vatExemptAmount = 0.00;
    $discountTotal = 0.00;

    if ($discountType === 'senior' || $discountType === 'pwd') {
      // PH-standard RA 9994 (Senior Citizen) & RA 10754 (PWD):
      // 1) Remove 12% VAT from VAT-inclusive gross total: VAT-Exempt Base = round(G / 1.12, 2)
      // 2) Apply 20% statutory discount on VAT-Exempt Base: Discount = round(Base * 0.20, 2)
      // 3) Final Total Due = round(Base - Discount, 2)
      $vatExemptSales = round($grossAfterPromo / 1.12, 2);
      $vatExemptAmount = round($grossAfterPromo - $vatExemptSales, 2);
      $discountTotal = round($vatExemptSales * 0.20, 2);
      $total = round($vatExemptSales - $discountTotal, 2);
      $vatableSales = 0.00;
      $tax = 0.00;
      $price = $vatExemptSales;
      $customDiscountMode = null;
      $customDiscountValue = 0.00;
    } elseif ($discountType === 'custom' && $customDiscountValue > 0) {
      if ($customDiscountMode === 'percent') {
        $customDiscountValue = min(100.0, round($customDiscountValue, 2));
        $discountTotal = round($grossAfterPromo * ($customDiscountValue / 100.0), 2);
      } else {
        $customDiscountValue = round($customDiscountValue, 2);
        $discountTotal = min($grossAfterPromo, $customDiscountValue);
      }
      $thresholds = getCustomDiscountThresholds($conn);
      $exceedsThreshold = ($customDiscountMode === 'percent' && $customDiscountValue > $thresholds['pct'])
        || ($discountTotal > $thresholds['amt']);
      if ($exceedsThreshold && !$discountSupervisorId && $user['role_name'] === 'Cashier') {
        throw new RuntimeException(
          "Supervisor override is required for custom discounts exceeding " .
          number_format($thresholds['pct'], 0) . "% or ₱" . number_format($thresholds['amt'], 2) . "."
        );
      }
      $total = max(0.00, round($grossAfterPromo - $discountTotal, 2));
      $vatableSales = round($total / 1.12, 2);
      $tax = round($total - $vatableSales, 2);
      $price = $vatableSales;
    } else {
      $discountType = 'none';
      $discountIdNumber = null;
      $customDiscountMode = null;
      $customDiscountValue = 0.00;
      $total = $grossAfterPromo;
      $vatableSales = round($total / 1.12, 2);
      $tax = round($total - $vatableSales, 2);
      $price = $vatableSales;
    }

    if ($sukiStatus === 'Has') {
      $pointsEarned = max(1, (int)floor($total / 100));
      $newPointsBalance = round(($sukiPointsBalance ?? 0) + $pointsEarned, 2);
      $sukiPointsBalance = $newPointsBalance;
      if ($sukiCardId) {
        $updateCardStmt = $conn->prepare("UPDATE tblsku_card SET points_balance = :newBal WHERE sku_card_id = :cardId");
        $updateCardStmt->execute([":newBal" => $newPointsBalance, ":cardId" => $sukiCardId]);
      }
    }

    $arPolicy = getArOverduePolicySettings($conn);
    $dueDate = null;
    $invNumber = null;
    if ($isAr) {
      // WP-5 5A.4: Block overdue AR accounts from charging new AR sales when ar_block_overdue_accounts is ON
      if (!empty($arPolicy['block_overdue_accounts'])) {
        $ovStmt = $conn->prepare(
          "SELECT COUNT(*) AS ov_count, COALESCE(SUM(balance), 0) AS ov_balance
           FROM tblar_invoice
           WHERE ar_customer_id = :customerId
             AND status <> 'Pending'
             AND COALESCE(balance, 0) > 0
             AND due_date < CURRENT_DATE"
        );
        $ovStmt->execute([":customerId" => $customerId]);
        $ovRow = $ovStmt->fetch(PDO::FETCH_ASSOC);
        $ovCount = (int)($ovRow['ov_count'] ?? 0);
        $ovBal = round((float)($ovRow['ov_balance'] ?? 0), 2);
        if ($ovCount > 0) {
          throw new RuntimeException(
            "AR Account Blocked: Customer has {$ovCount} overdue invoice(s) totaling ₱" .
            number_format($ovBal, 2) . ". Settle overdue balances before charging new AR sales."
          );
        }
      }

      $exposureStmt = $conn->prepare(
        "SELECT
           COALESCE((SELECT SUM(balance) FROM tblar_invoice
                     WHERE ar_customer_id = :invoiceCustomerId AND status <> 'Pending' AND COALESCE(balance, 0) > 0), 0)
           +
           COALESCE((SELECT SUM(s.total_amount) FROM tblsales s
                     WHERE s.ar_customer_id = :saleCustomerId AND s.sale_type = 'AR'
                       AND NOT EXISTS (SELECT 1 FROM tblar_invoice i WHERE i.sale_id = s.sale_id)), 0)"
      );
      $exposureStmt->execute([":invoiceCustomerId" => $customerId, ":saleCustomerId" => $customerId]);
      $exposure = (float)$exposureStmt->fetchColumn();
      if (round($exposure + $total, 2) > round($creditLimit, 2)) {
        $available = max(0, $creditLimit - $exposure);
        throw new RuntimeException(
          "Credit limit exceeded. Limit: " . number_format($creditLimit, 2, '.', '') .
          "; current exposure: " . number_format($exposure, 2, '.', '') .
          "; available credit: " . number_format($available, 2, '.', '') . "."
        );
      }
    }
    $balance = $isAr ? $total : 0;
    $saleStmt = $conn->prepare(
      "INSERT INTO tblsales(
         pos_terminal_id, cashier_user_id, shift_id, sale_date, sale_type, payment_method_id, ar_customer_id,
         price, tax_total, total_amount, balance, suki_card_id, suki_card_status, suki_points_balance,
         discount_type, discount_id_number, vat_exempt_sales, vat_exempt_amount, discount_total,
         custom_discount_mode, custom_discount_value, discount_supervisor_id
       )
       VALUES(
         :terminalId, :cashierId, :shiftId, CURRENT_DATE, :saleType, :paymentMethodId, :customerId,
         :price, :tax, :total, :balance, :sukiCardId, :sukiStatus, :sukiPoints,
         :discountType, :discountIdNumber, :vatExemptSales, :vatExemptAmount, :discountTotal,
         :customDiscountMode, :customDiscountValue, :discountSupervisorId
       )"
    );
    $saleStmt->execute([
      ":terminalId" => $terminalId,
      ":cashierId" => $data['cashierUserId'],
      ":shiftId" => $activeShiftId,
      ":saleType" => $data['saleType'],
      ":paymentMethodId" => $isAr ? null : $paymentMethodId,
      ":customerId" => $customerId,
      ":price" => $price,
      ":tax" => $tax,
      ":total" => $total,
      ":balance" => $balance,
      ":sukiCardId" => $sukiCardId,
      ":sukiStatus" => $sukiStatus,
      ":sukiPoints" => $sukiPointsBalance,
      ":discountType" => $discountType,
      ":discountIdNumber" => $discountIdNumber !== '' ? $discountIdNumber : null,
      ":vatExemptSales" => $vatExemptSales,
      ":vatExemptAmount" => $vatExemptAmount,
      ":discountTotal" => $discountTotal,
      ":customDiscountMode" => $customDiscountMode,
      ":customDiscountValue" => $customDiscountValue,
      ":discountSupervisorId" => $discountSupervisorId
    ]);
    $saleId = (int)$conn->lastInsertId();
    $detailStmt = $conn->prepare(
      "INSERT INTO tblsales_detail(sale_id, product_id, promo_id, quantity, unit_price, discount, promo_discount, line_total, cost_at_sale)
       VALUES(:saleId, :productId, :promoId, :quantity, :unitPrice, :discount, :promoDiscount, :lineTotal, :cost)"
    );
    $stockStmt = $conn->prepare(
      "UPDATE tblproducts
       SET stock_quantity = CASE WHEN COALESCE(stock_quantity, 100) >= :qty1 THEN COALESCE(stock_quantity, 100) - :qty2 ELSE 0 END
       WHERE product_id = :productId"
    );
    foreach ($detailRows as $row) {
      $detailStmt->execute([
        ":saleId" => $saleId,
        ":productId" => $row[0],
        ":promoId" => $row[1],
        ":quantity" => $row[2],
        ":unitPrice" => $row[3],
        ":discount" => $row[4],
        ":promoDiscount" => $row[5],
        ":lineTotal" => $row[6],
        ":cost" => $row[7]
      ]);
      $stockStmt->execute([
        ":qty1" => (int)$row[2],
        ":qty2" => (int)$row[2],
        ":productId" => $row[0]
      ]);
    }
    if ($isAr) {
      // WP-5 5A.1: Configurable default term days from system settings (ar_default_term_days)
      $termDays = (int)$arPolicy['default_term_days'];
      if (!empty($data['termDays']) && is_numeric($data['termDays']) && (int)$data['termDays'] >= 1) {
        $termDays = (int)$data['termDays'];
      }
      $dueDate = date('Y-m-d', strtotime("+{$termDays} days"));

      $invNumber = "INV-" . str_pad((string)$saleId, 8, "0", STR_PAD_LEFT);
      $invStmt = $conn->prepare(
        "INSERT INTO tblar_invoice
          (invoice_number, ar_customer_id, sale_id, created_by_user_id, invoice_date, due_date, principal_amount, invoice_amount, balance, status)
         VALUES (:number, :customerId, :saleId, :userId, CURRENT_DATE, :dueDate, :principalAmount, :amount, :balance, 'Approved')"
      );
      $invStmt->execute([
        ":number" => $invNumber,
        ":customerId" => $customerId,
        ":saleId" => $saleId,
        ":userId" => $data['cashierUserId'],
        ":dueDate" => $dueDate,
        ":principalAmount" => $total,
        ":amount" => $total,
        ":balance" => $total
      ]);
    }
    $heldId = filter_var($data['heldId'] ?? null, FILTER_VALIDATE_INT);
    if ($heldId && $heldId > 0) {
      $delHeld = $conn->prepare("DELETE FROM tblheld_transactions WHERE held_id = :heldId");
      $delHeld->execute([":heldId" => $heldId]);
    }
    if (!$isAr) {
      $drawerStmt = $conn->prepare(
        "INSERT INTO tbldrawer_events (shift_id, event_type, amount, authorized_by, notes, created_at)
         VALUES (:shiftId, 'sale', :amount, :authorizedBy, :notes, CURRENT_TIMESTAMP)"
      );
      $drawerStmt->execute([
        ":shiftId" => $activeShiftId,
        ":amount" => $total,
        ":authorizedBy" => $data['cashierUserId'],
        ":notes" => "Cash sale #" . $saleId
      ]);
    }
    $conn->commit();
    return json_encode([
      "returnValue" => 1,
      "status" => 200,
      "saleId" => $saleId,
      "shiftId" => $activeShiftId,
      "dueDate" => $dueDate,
      "invoiceNumber" => $invNumber,
      "pointsEarned" => $pointsEarned ?? 0,
      "newSukiPointsBalance" => $sukiPointsBalance
    ]);
  } catch (Throwable $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => $e->getMessage()]);
  }
}

function holdTransaction($json, $user) {
  include "connection-pdo.php";
  if (!empty($_SESSION['shift_closed_lock'])) {
    http_response_code(403);
    return json_encode(["returnValue" => 0, "message" => "Session is locked following End of Shift. Please log in again."]);
  }
  $terminalId = resolveSessionTerminalId($conn, $user);
  $activeShift = findOpenShift($conn, $user['user_id'], $terminalId);
  if (!$activeShift) {
    http_response_code(403);
    return json_encode(["returnValue" => 0, "message" => "Shift not open: Open a shift with beginning cash before holding a transaction."]);
  }
  $data = json_decode($json, true);
  if (!is_array($data) || empty($data['items']) || !is_array($data['items'])) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "At least one item is required in the cart to hold transaction."]);
  }
  $customerLabel = trim($data['customerLabel'] ?? '');
  $holdRef = trim($data['holdReference'] ?? '');
  if ($holdRef === '') {
    $holdRef = "HOLD-" . date("Ymd-His");
  }
  $saleType = in_array($data['saleType'] ?? '', ['Cash', 'AR'], true) ? $data['saleType'] : 'Cash';
  $itemsJson = json_encode($data['items']);
  $cartStateJson = json_encode([
    "saleType" => $saleType,
    "paymentMethodId" => $data['paymentMethodId'] ?? null,
    "customerId" => $data['customerId'] ?? null,
    "sukiCardStatus" => $data['sukiCardStatus'] ?? 'None',
    "sukiCardId" => $data['sukiCardId'] ?? null,
    "sukiPointsBalance" => $data['sukiPointsBalance'] ?? null,
    "taxRate" => $data['taxRate'] ?? 0,
    "discountType" => $data['discountType'] ?? 'none',
    "discountIdNumber" => $data['discountIdNumber'] ?? '',
    "customDiscountMode" => $data['customDiscountMode'] ?? 'percent',
    "customDiscountValue" => $data['customDiscountValue'] ?? 0,
    "shiftId" => (int)$activeShift['shift_id'],
    "terminalId" => (int)$terminalId
  ]);

  // WP-3: Stock policy — NO stock decrement on hold (decrement happens only on sale completion).
  // Persist paired conditions: (cashier_user_id, terminal_id, shift_id)
  $stmt = $conn->prepare(
    "INSERT INTO tblheld_transactions(hold_reference, cashier_user_id, terminal_id, shift_id, customer_label, sale_type, items_json, cart_state_json, created_at)
     VALUES(:ref, :cashierId, :terminalId, :shiftId, :label, :saleType, :items, :state, CURRENT_TIMESTAMP)"
  );
  $stmt->execute([
    ":ref" => $holdRef,
    ":cashierId" => (int)$user['user_id'],
    ":terminalId" => (int)$terminalId,
    ":shiftId" => (int)$activeShift['shift_id'],
    ":label" => $customerLabel !== '' ? $customerLabel : null,
    ":saleType" => $saleType,
    ":items" => $itemsJson,
    ":state" => $cartStateJson
  ]);
  $heldId = (int)$conn->lastInsertId();
  return json_encode([
    "returnValue" => 1,
    "heldId" => $heldId,
    "holdReference" => $holdRef,
    "terminalId" => (int)$terminalId,
    "shiftId" => (int)$activeShift['shift_id'],
    "message" => "Sale held successfully."
  ]);
}

function getHeldTransactions($user = null) {
  include "connection-pdo.php";
  if (!$user) {
    $user = currentUser();
  }
  $terminalId = resolveSessionTerminalId($conn, $user);
  $activeShift = $user ? findOpenShift($conn, $user['user_id'], $terminalId) : null;
  $activeShiftId = $activeShift ? (int)$activeShift['shift_id'] : -1;

  // WP-3.3 & 3.6: Lists ONLY tickets resumable under current paired conditions (same cashier + same terminal + same shift)
  $stmt = $conn->prepare(
    "SELECT h.held_id, h.hold_reference, h.cashier_user_id, h.terminal_id, h.shift_id,
            h.customer_label, h.sale_type, h.items_json, h.cart_state_json, h.created_at,
            CONCAT(u.first_name, ' ', u.last_name) AS cashier_name,
            t.terminal_name
     FROM tblheld_transactions h
     LEFT JOIN tblusers u ON u.user_id = h.cashier_user_id
     LEFT JOIN tblpos_terminals t ON t.pos_terminal_id = h.terminal_id
     WHERE h.cashier_user_id = :cashierId
       AND COALESCE(h.terminal_id, :terminalIdFallback) = :terminalId
       AND COALESCE(h.shift_id, :shiftIdFallback) = :shiftId
       AND (h.status IS NULL OR h.status = 'HELD')
     ORDER BY h.held_id DESC"
  );
  $stmt->execute([
    ":cashierId" => (int)($user['user_id'] ?? 0),
    ":terminalIdFallback" => (int)$terminalId,
    ":terminalId" => (int)$terminalId,
    ":shiftIdFallback" => $activeShiftId,
    ":shiftId" => $activeShiftId
  ]);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
  $result = [];
  foreach ($rows as $row) {
    $items = json_decode($row['items_json'], true) ?: [];
    $itemCount = 0;
    $totalAmount = 0;
    foreach ($items as $item) {
      $qty = (float)($item['quantity'] ?? 1);
      $price = (float)($item['unitPrice'] ?? 0);
      $promoRate = (float)($item['promoRate'] ?? 0);
      $grossLine = $qty * $price;
      $promoDisc = $promoRate > 0 ? round(($grossLine * $promoRate) / 100, 2) : 0;
      $lineAmount = $grossLine - $promoDisc;
      $itemCount += $qty;
      $totalAmount += $lineAmount;
    }
    $result[] = [
      "held_id" => (int)$row['held_id'],
      "hold_reference" => $row['hold_reference'],
      "cashier_user_id" => (int)$row['cashier_user_id'],
      "cashier_name" => $row['cashier_name'] ?? 'Staff',
      "terminal_id" => $row['terminal_id'] !== null ? (int)$row['terminal_id'] : (int)$terminalId,
      "terminal_name" => $row['terminal_name'] ?? ('Terminal #' . $terminalId),
      "shift_id" => $row['shift_id'] !== null ? (int)$row['shift_id'] : $activeShiftId,
      "customer_label" => $row['customer_label'] ?? '',
      "sale_type" => $row['sale_type'],
      "items" => $items,
      "cart_state" => json_decode($row['cart_state_json'] ?? '{}', true) ?: [],
      "item_count" => $itemCount,
      "total_amount" => round($totalAmount, 2),
      "created_at" => $row['created_at']
    ];
  }
  return json_encode($result);
}

function resumeHeldTransaction($json, $user) {
  include "connection-pdo.php";
  if (!empty($_SESSION['shift_closed_lock'])) {
    http_response_code(403);
    return json_encode(["returnValue" => 0, "message" => "Session is locked following End of Shift. Please log in again."]);
  }
  $data = [];
  if (is_string($json) && trim($json) !== '') {
    $data = json_decode($json, true) ?: [];
  } elseif (is_array($json)) {
    $data = $json;
  }
  $heldId = filter_var($data['heldId'] ?? ($_POST['heldId'] ?? ($_GET['heldId'] ?? null)), FILTER_VALIDATE_INT);
  if (!$heldId || $heldId < 1) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "A valid held ticket ID is required to resume a sale."]);
  }

  $stmt = $conn->prepare(
    "SELECT h.*,
            CONCAT(u.first_name, ' ', u.last_name) AS cashier_name,
            t.terminal_name
     FROM tblheld_transactions h
     LEFT JOIN tblusers u ON u.user_id = h.cashier_user_id
     LEFT JOIN tblpos_terminals t ON t.pos_terminal_id = h.terminal_id
     WHERE h.held_id = :heldId"
  );
  $stmt->execute([":heldId" => $heldId]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$row) {
    http_response_code(404);
    return json_encode(["returnValue" => 0, "message" => "Held sale ticket not found or has already been resumed."]);
  }

  $terminalId = resolveSessionTerminalId($conn, $user);
  $activeShift = findOpenShift($conn, $user['user_id'], $terminalId);
  $cartState = json_decode($row['cart_state_json'] ?? '{}', true) ?: [];
  $ticketCashierId = (int)$row['cashier_user_id'];
  $ticketTerminalId = $row['terminal_id'] !== null ? (int)$row['terminal_id'] : (int)($cartState['terminalId'] ?? 0);
  $ticketShiftId = $row['shift_id'] !== null ? (int)$row['shift_id'] : (int)($cartState['shiftId'] ?? 0);

  // WP-3.3: Enforce Session Isolation ("original paired conditions": same cashier + same terminal + same shift)
  if ($ticketCashierId !== (int)$user['user_id']) {
    $ownerLabel = $row['cashier_name'] ?: "Cashier #{$ticketCashierId}";
    http_response_code(403);
    return json_encode([
      "returnValue" => 0,
      "reason" => "wrong_cashier",
      "message" => "Resume blocked: Ticket {$row['hold_reference']} was held by {$ownerLabel}. A held sale can only be resumed by the same cashier on the same terminal and shift."
    ]);
  }

  if ($ticketTerminalId > 0 && $ticketTerminalId !== (int)$terminalId) {
    $termLabel = $row['terminal_name'] ?: "Terminal #{$ticketTerminalId}";
    http_response_code(403);
    return json_encode([
      "returnValue" => 0,
      "reason" => "wrong_terminal",
      "message" => "Resume blocked: Ticket {$row['hold_reference']} was held on {$termLabel} (Terminal #{$ticketTerminalId}) and cannot be resumed on Terminal #{$terminalId}."
    ]);
  }

  if (!$activeShift || ($ticketShiftId > 0 && $ticketShiftId !== (int)$activeShift['shift_id'])) {
    http_response_code(403);
    return json_encode([
      "returnValue" => 0,
      "reason" => "wrong_shift",
      "message" => "Resume blocked: Ticket {$row['hold_reference']} was held in Shift #{$ticketShiftId}, which is no longer the active open shift."
    ]);
  }

  // WP-3.2: Re-validate stock availability for each held item
  $items = json_decode($row['items_json'], true) ?: [];
  $stockWarnings = [];
  $prodStmt = $conn->prepare(
    "SELECT product_id, product_name, price, COALESCE(stock_quantity, 100) AS stock_quantity, is_active
     FROM tblproducts WHERE product_id = :pid"
  );
  foreach ($items as &$item) {
    $pid = (int)($item['productId'] ?? 0);
    $reqQty = (int)($item['quantity'] ?? 1);
    $prodStmt->execute([":pid" => $pid]);
    $prodRow = $prodStmt->fetch(PDO::FETCH_ASSOC);
    $availStock = $prodRow ? (int)$prodRow['stock_quantity'] : 0;
    $isActive = $prodRow ? (int)$prodRow['is_active'] === 1 : false;
    $item['availableStock'] = $availStock;
    if (!$prodRow || !$isActive || $availStock < $reqQty) {
      $stockWarnings[] = [
        "productId" => $pid,
        "productName" => $prodRow['product_name'] ?? ($item['productName'] ?? "Product #{$pid}"),
        "requestedQty" => $reqQty,
        "availableStock" => $availStock,
        "message" => !$isActive
          ? ($prodRow['product_name'] ?? "Product #{$pid}") . " is now inactive."
          : ($prodRow['product_name'] ?? ($item['productName'] ?? "Product #{$pid}")) . ": requested {$reqQty}, only {$availStock} available in stock."
      ];
    }
  }
  unset($item);

  // WP-3.6: Selecting a held ticket restores the full snapshot and removes it from the hold list
  $delStmt = $conn->prepare("DELETE FROM tblheld_transactions WHERE held_id = :heldId");
  $delStmt->execute([":heldId" => $heldId]);

  $itemCount = 0;
  $totalAmount = 0;
  foreach ($items as $it) {
    $q = (float)($it['quantity'] ?? 1);
    $p = (float)($it['unitPrice'] ?? 0);
    $pr = (float)($it['promoRate'] ?? 0);
    $gl = $q * $p;
    $pd = $pr > 0 ? round(($gl * $pr) / 100, 2) : 0;
    $itemCount += $q;
    $totalAmount += ($gl - $pd);
  }

  return json_encode([
    "returnValue" => 1,
    "held" => [
      "held_id" => (int)$row['held_id'],
      "hold_reference" => $row['hold_reference'],
      "cashier_user_id" => $ticketCashierId,
      "terminal_id" => $ticketTerminalId,
      "shift_id" => $ticketShiftId,
      "customer_label" => $row['customer_label'] ?? '',
      "sale_type" => $row['sale_type'],
      "items" => $items,
      "cart_state" => $cartState,
      "item_count" => $itemCount,
      "total_amount" => round($totalAmount, 2),
      "created_at" => $row['created_at']
    ],
    "hasStockWarning" => !empty($stockWarnings),
    "stockWarnings" => $stockWarnings
  ]);
}

function deleteHeldTransaction($heldId) {
  include "connection-pdo.php";
  $stmt = $conn->prepare("DELETE FROM tblheld_transactions WHERE held_id = :heldId");
  $stmt->execute([":heldId" => $heldId]);
  return json_encode(["returnValue" => 1]);
}

function getActiveShift($user) {
  include "connection-pdo.php";
  $terminalId = resolveSessionTerminalId($conn, $user);
  if (!$terminalId) {
    return json_encode(["returnValue" => 1, "activeShift" => null, "minOpeningFloat" => getMinOpeningFloat($conn)]);
  }
  $shift = findOpenShift($conn, $user['user_id'], $terminalId);
  return json_encode([
    "returnValue" => 1,
    "activeShift" => $shift,
    "minOpeningFloat" => getMinOpeningFloat($conn)
  ]);
}

function openShift($json, $user) {
  include "connection-pdo.php";
  $data = json_decode($json, true) ?: [];
  $terminalId = $_SESSION['pos_terminal_id'] ?? ($data['terminalId'] ?? null);
  if (!$terminalId) {
    $terminalId = resolveSessionTerminalId($conn, $user);
  }
  if (!$terminalId) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "A terminal must be selected before opening a shift."]);
  }

  $rawOpening = $data['openingCash'] ?? ($data['opening_cash'] ?? null);
  $minFloat = getMinOpeningFloat($conn);
  if ($rawOpening === null || $rawOpening === '' || !is_scalar($rawOpening) || !preg_match('/^\d+(?:\.\d{1,2})?$/', trim((string)$rawOpening))) {
    http_response_code(422);
    return json_encode([
      "returnValue" => 0,
      "message" => "Invalid opening float. Enter a valid numeric amount (>= ₱" . number_format($minFloat, 2) . ") with up to 2 decimal places."
    ]);
  }
  $openingCash = round((float)$rawOpening, 2);
  if ($openingCash < $minFloat || $openingCash > 9999999.99) {
    http_response_code(422);
    return json_encode([
      "returnValue" => 0,
      "message" => "Opening float must be between ₱" . number_format($minFloat, 2) . " and ₱9,999,999.99."
    ]);
  }

  $existing = findOpenShift($conn, $user['user_id'], $terminalId);
  if ($existing) {
    unset($_SESSION['shift_closed_lock']);
    return json_encode(["returnValue" => 1, "message" => "Shift already open.", "shift" => $existing]);
  }

  try {
    $conn->beginTransaction();
    $stmt = $conn->prepare(
      "INSERT INTO tblshifts (user_id, terminal_id, opening_cash, current_float, opened_at, status)
       VALUES (:userId, :terminalId, :openingCash, :currentFloat, CURRENT_TIMESTAMP, 'open')"
    );
    $stmt->execute([
      ":userId" => $user['user_id'],
      ":terminalId" => $terminalId,
      ":openingCash" => $openingCash,
      ":currentFloat" => $openingCash
    ]);
    $newShiftId = (int)$conn->lastInsertId();

    $evtStmt = $conn->prepare(
      "INSERT INTO tbldrawer_events (shift_id, event_type, amount, authorized_by, notes, created_at)
       VALUES (:shiftId, 'opening_float', :amount, :authorizedBy, 'Opening shift starting float', CURRENT_TIMESTAMP)"
    );
    $evtStmt->execute([
      ":shiftId" => $newShiftId,
      ":amount" => $openingCash,
      ":authorizedBy" => $user['user_id']
    ]);

    $conn->commit();
    unset($_SESSION['shift_closed_lock']);

    $newShiftStmt = $conn->prepare(
      "SELECT shift_id, user_id, terminal_id, opening_cash, current_float, opened_at, status
       FROM tblshifts WHERE shift_id = :shiftId"
    );
    $newShiftStmt->execute([":shiftId" => $newShiftId]);
    $newShift = $newShiftStmt->fetch(PDO::FETCH_ASSOC);

    return json_encode(["returnValue" => 1, "shift" => $newShift]);
  } catch (Throwable $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    return json_encode(["returnValue" => 0, "message" => "Failed to open shift: " . $e->getMessage()]);
  }
}

function computeShiftSummaryData($conn, $shiftId) {
  $stmt = $conn->prepare(
    "SELECT s.*,
            CONCAT(u.first_name, ' ', u.last_name) AS cashier_name,
            u.username AS cashier_username,
            t.terminal_name,
            CONCAT(sup.first_name, ' ', sup.last_name) AS supervisor_name,
            sup.username AS supervisor_username
     FROM tblshifts s
     INNER JOIN tblusers u ON u.user_id = s.user_id
     LEFT JOIN tblpos_terminals t ON t.pos_terminal_id = s.terminal_id
     LEFT JOIN tblusers sup ON sup.user_id = s.closed_by_supervisor_id
     WHERE s.shift_id = :shiftId"
  );
  $stmt->execute([":shiftId" => $shiftId]);
  $shift = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$shift) {
    return null;
  }

  $startingBalance = round((float)$shift['opening_cash'], 2);

  // Drawer events breakdown for this shift
  $evtStmt = $conn->prepare(
    "SELECT event_type, COALESCE(SUM(amount), 0) AS total_amount, COUNT(*) AS event_count
     FROM tbldrawer_events
     WHERE shift_id = :shiftId
     GROUP BY event_type"
  );
  $evtStmt->execute([":shiftId" => $shiftId]);
  $evtRows = $evtStmt->fetchAll(PDO::FETCH_ASSOC);

  $floatsAdded = 0.00;
  $liftsDrops = 0.00;
  $refunds = 0.00;
  $drawerSaleEventsTotal = 0.00;

  foreach ($evtRows as $er) {
    $etype = strtolower(trim($er['event_type']));
    $amt = round((float)$er['total_amount'], 2);
    if ($etype === 'float') {
      $floatsAdded = round($floatsAdded + $amt, 2);
    } elseif ($etype === 'lift' || $etype === 'drop') {
      $liftsDrops = round($liftsDrops + $amt, 2);
    } elseif ($etype === 'refund') {
      $refunds = round($refunds + $amt, 2);
    } elseif ($etype === 'sale') {
      $drawerSaleEventsTotal = round($drawerSaleEventsTotal + $amt, 2);
    }
  }

  // Sales breakdown for this shift (from tblsales where shift_id = :shiftId)
  $salesStmt = $conn->prepare(
    "SELECT sale_type, COUNT(*) AS tx_count, COALESCE(SUM(total_amount), 0) AS tx_total
     FROM tblsales
     WHERE shift_id = :shiftId
     GROUP BY sale_type"
  );
  $salesStmt->execute([":shiftId" => $shiftId]);
  $salesRows = $salesStmt->fetchAll(PDO::FETCH_ASSOC);

  $cashSalesCount = 0;
  $cashSalesTotal = 0.00;
  $arSalesCount = 0;
  $arSalesTotal = 0.00;

  foreach ($salesRows as $sr) {
    if ($sr['sale_type'] === 'Cash') {
      $cashSalesCount = (int)$sr['tx_count'];
      $cashSalesTotal = round((float)$sr['tx_total'], 2);
    } elseif ($sr['sale_type'] === 'AR') {
      $arSalesCount = (int)$sr['tx_count'];
      $arSalesTotal = round((float)$sr['tx_total'], 2);
    }
  }

  // If legacy cash sales were recorded only in tbldrawer_events before shift_id column existed
  if ($cashSalesTotal == 0.00 && $drawerSaleEventsTotal > 0.00) {
    $cashSalesTotal = $drawerSaleEventsTotal;
  }

  $currentFloat = round($startingBalance + $floatsAdded - $liftsDrops, 2);
  $expectedCash = round($startingBalance + $floatsAdded + $cashSalesTotal - $refunds - $liftsDrops, 2);

  $closingCash = $shift['closing_cash'] !== null ? round((float)$shift['closing_cash'], 2) : null;
  $varianceAmount = $closingCash !== null ? round($closingCash - $expectedCash, 2) : null;
  $varianceStatus = null;
  if ($varianceAmount !== null) {
    if (abs($varianceAmount) < 0.005) {
      $varianceStatus = 'BALANCED';
      $varianceAmount = 0.00;
    } elseif ($varianceAmount > 0) {
      $varianceStatus = 'OVER';
    } else {
      $varianceStatus = 'SHORT';
    }
  }

  // Open holds count for this shift/pairing (only active HELD status)
  $holdsStmt = $conn->prepare(
    "SELECT COUNT(*) FROM tblheld_transactions
     WHERE (shift_id = :shiftId
        OR (shift_id IS NULL AND cashier_user_id = :userId AND COALESCE(terminal_id, :termId) = :termId))
       AND (status IS NULL OR status = 'HELD')"
  );
  $holdsStmt->execute([
    ":shiftId" => (int)$shift['shift_id'],
    ":userId" => (int)$shift['user_id'],
    ":termId" => (int)$shift['terminal_id']
  ]);
  $openHoldsCount = (int)$holdsStmt->fetchColumn();

  // Discarded holds count at EOS
  $discardedHoldsCount = 0;
  try {
    $discStmt = $conn->prepare(
      "SELECT COUNT(*) FROM tblheld_transactions
       WHERE shift_id = :shiftId AND status = 'DISCARDED_EOS'"
    );
    $discStmt->execute([":shiftId" => (int)$shift['shift_id']]);
    $discardedHoldsCount = (int)$discStmt->fetchColumn();
  } catch (Throwable $e) {}

  // WP-5 5B.6: Credit & Debit Memos included in EOS AR totals
  $creditMemosCount = 0;
  $creditMemosTotal = 0.00;
  $debitMemosCount = 0;
  $debitMemosTotal = 0.00;
  try {
    $memoStmt = $conn->prepare(
      "SELECT entry_type, COUNT(*) AS memo_count, COALESCE(SUM(amount), 0) AS memo_total
       FROM tblar_ledger_entries
       WHERE entry_type IN ('credit_memo', 'debit_memo')
         AND (shift_id = :shiftId OR (shift_id IS NULL AND created_at >= :openedAt AND (:closedAt IS NULL OR created_at <= :closedAt)))
       GROUP BY entry_type"
    );
    $memoStmt->execute([
      ":shiftId" => (int)$shift['shift_id'],
      ":openedAt" => $shift['opened_at'],
      ":closedAt" => $shift['closed_at']
    ]);
    foreach ($memoStmt->fetchAll(PDO::FETCH_ASSOC) as $mrow) {
      if ($mrow['entry_type'] === 'credit_memo') {
        $creditMemosCount = (int)$mrow['memo_count'];
        $creditMemosTotal = round((float)$mrow['memo_total'], 2);
      } elseif ($mrow['entry_type'] === 'debit_memo') {
        $debitMemosCount = (int)$mrow['memo_count'];
        $debitMemosTotal = round((float)$mrow['memo_total'], 2);
      }
    }
  } catch (Throwable $e) {
    // Table may not exist before WP-5 migration
  }
  $netArPostedTotal = round($arSalesTotal + $debitMemosTotal - $creditMemosTotal, 2);

  return [
    "shift_id" => (int)$shift['shift_id'],
    "user_id" => (int)$shift['user_id'],
    "cashier_name" => $shift['cashier_name'],
    "cashier_username" => $shift['cashier_username'],
    "terminal_id" => (int)$shift['terminal_id'],
    "terminal_name" => $shift['terminal_name'] ?? ('Terminal #' . $shift['terminal_id']),
    "opened_at" => $shift['opened_at'],
    "closed_at" => $shift['closed_at'],
    "status" => $shift['status'],
    "starting_balance" => $startingBalance,
    "floats_added_total" => $floatsAdded,
    "current_float" => $currentFloat,
    "cash_sales_count" => $cashSalesCount,
    "cash_sales_total" => $cashSalesTotal,
    "refunds_total" => $refunds,
    "lifts_total" => $liftsDrops,
    "expected_cash" => $expectedCash,
    "expected_cash_in_hand" => $expectedCash,
    "ar_sales_count" => $arSalesCount,
    "ar_sales_total" => $arSalesTotal,
    "credit_memos_count" => $creditMemosCount,
    "credit_memos_total" => $creditMemosTotal,
    "debit_memos_count" => $debitMemosCount,
    "debit_memos_total" => $debitMemosTotal,
    "net_ar_posted_total" => $netArPostedTotal,
    "actual_counted_cash" => $closingCash,
    "variance_amount" => $varianceAmount,
    "variance_status" => $varianceStatus,
    "closed_by_supervisor_id" => $shift['closed_by_supervisor_id'] ? (int)$shift['closed_by_supervisor_id'] : null,
    "supervisor_name" => $shift['supervisor_name'] ?: null,
    "open_holds_count" => $openHoldsCount,
    "discarded_holds_count" => $discardedHoldsCount
  ];
}

function getShiftSummary($user) {
  include "connection-pdo.php";
  $shiftId = filter_var($_GET['shiftId'] ?? ($_POST['shiftId'] ?? null), FILTER_VALIDATE_INT);
  if (!$shiftId) {
    $terminalId = resolveSessionTerminalId($conn, $user);
    $activeShift = findOpenShift($conn, $user['user_id'], $terminalId);
    if (!$activeShift) {
      http_response_code(404);
      return json_encode(["returnValue" => 0, "message" => "No active open shift found."]);
    }
    $shiftId = (int)$activeShift['shift_id'];
  }
  $summary = computeShiftSummaryData($conn, $shiftId);
  if (!$summary) {
    http_response_code(404);
    return json_encode(["returnValue" => 0, "message" => "Shift record not found."]);
  }
  return json_encode(["returnValue" => 1, "summary" => $summary]);
}

function closeShift($json, $user) {
  include "connection-pdo.php";
  $data = [];
  if (is_string($json) && trim($json) !== '') {
    $data = json_decode($json, true) ?: [];
  } elseif (is_array($json)) {
    $data = $json;
  }
  if (empty($data)) {
    $raw = file_get_contents('php://input');
    if ($raw) {
      $data = json_decode($raw, true) ?: [];
    }
  }
  if (empty($data)) {
    $data = $_POST;
  }

  $terminalId = resolveSessionTerminalId($conn, $user);
  $shiftId = filter_var($data['shiftId'] ?? ($data['shift_id'] ?? null), FILTER_VALIDATE_INT);
  if (!$shiftId) {
    $activeShift = findOpenShift($conn, $user['user_id'], $terminalId);
    $shiftId = $activeShift ? (int)$activeShift['shift_id'] : null;
  }
  if (!$shiftId) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "No active open shift found to close."]);
  }

  // FIX 1: Open held sales no longer block EOS — they are automatically discarded at shift close.

  // WP-1 1B.5: Enforce Supervisor Credential Gate on Server Side
  $supervisorId = filter_var($data['supervisorId'] ?? ($data['supervisor_id'] ?? null), FILTER_VALIDATE_INT);
  $authLogId = filter_var($data['authLogId'] ?? ($data['auth_log_id'] ?? ($data['log_id'] ?? null)), FILTER_VALIDATE_INT);
  $supUsername = trim($data['supervisorUsername'] ?? ($data['supervisor_username'] ?? ''));
  $supPassword = $data['supervisorPassword'] ?? ($data['supervisor_password'] ?? '');

  $verifiedSupervisor = null;

  if ($authLogId && $supervisorId) {
    $logStmt = $conn->prepare(
      "SELECT l.id, l.supervisor_id, u.username, u.first_name, u.last_name, r.role_name, COALESCE(u.role, '') AS role
       FROM tblauthorization_log l
       INNER JOIN tblusers u ON u.user_id = l.supervisor_id
       LEFT JOIN tblroles r ON r.role_id = u.role_id
       WHERE l.id = :logId AND l.supervisor_id = :supId AND u.is_active = 1"
    );
    $logStmt->execute([":logId" => $authLogId, ":supId" => $supervisorId]);
    $row = $logStmt->fetch(PDO::FETCH_ASSOC);
    if ($row) {
      $verifiedSupervisor = $row;
    }
  }

  if (!$verifiedSupervisor && $supUsername !== '' && $supPassword !== '') {
    $supStmt = $conn->prepare(
      "SELECT u.user_id AS supervisor_id, u.username, u.first_name, u.last_name, u.password_hash,
              COALESCE(u.role, '') AS role, r.role_name
       FROM tblusers u
       LEFT JOIN tblroles r ON r.role_id = u.role_id
       WHERE LOWER(u.username) = LOWER(:username) AND u.is_active = 1"
    );
    $supStmt->execute([":username" => $supUsername]);
    $supRow = $supStmt->fetch(PDO::FETCH_ASSOC);
    if ($supRow && !empty($supRow['password_hash']) && password_verify($supPassword, $supRow['password_hash'])) {
      $rText = strtolower(trim($supRow['role']));
      $rName = strtolower(trim($supRow['role_name'] ?? ''));
      if (in_array($rText, ['supervisor', 'admin', 'manager'], true) || in_array($rName, ['supervisor', 'admin', 'manager'], true)) {
        $insLog = $conn->prepare(
          "INSERT INTO tblauthorization_log (cashier_id, supervisor_id, action_type, target_reference, shift_id, created_at)
           VALUES (:cashierId, :supervisorId, 'end_of_shift', :targetRef, :shiftId, CURRENT_TIMESTAMP)"
        );
        $insLog->execute([
          ":cashierId" => $user['user_id'],
          ":supervisorId" => $supRow['supervisor_id'],
          ":targetRef" => "End of Shift #" . $shiftId,
          ":shiftId" => $shiftId
        ]);
        $authLogId = (int)$conn->lastInsertId();
        $supervisorId = (int)$supRow['supervisor_id'];
        $verifiedSupervisor = $supRow;
      }
    }
  }

  if (!$verifiedSupervisor) {
    http_response_code(403);
    return json_encode([
      "returnValue" => 0,
      "message" => "Supervisor authorization is required to perform End of Shift (EOS)."
    ]);
  }

  // Validate actual counted cash entered at EOS
  $rawActualCash = $data['actualCountedCash'] ?? ($data['closingCash'] ?? ($data['actual_cash'] ?? null));
  if ($rawActualCash === null || $rawActualCash === '' || !is_scalar($rawActualCash) || !preg_match('/^\d+(?:\.\d{1,2})?$/', trim((string)$rawActualCash))) {
    http_response_code(422);
    return json_encode([
      "returnValue" => 0,
      "message" => "Please enter a valid non-negative actual counted cash amount (up to 2 decimal places)."
    ]);
  }
  $actualCountedCash = round((float)$rawActualCash, 2);

  try {
    $conn->beginTransaction();

    // FIX 1: Atomically discard all open held tickets for this cashier and shift
    $discardStmt = $conn->prepare(
      "UPDATE tblheld_transactions
       SET status = 'DISCARDED_EOS'
       WHERE cashier_user_id = :userId
         AND (shift_id = :shiftId OR (shift_id IS NULL AND COALESCE(terminal_id, :termId) = :termId))
         AND (status IS NULL OR status = 'HELD')"
    );
    $discardStmt->execute([
      ":userId" => (int)$user['user_id'],
      ":shiftId" => $shiftId,
      ":termId" => (int)$terminalId
    ]);
    $discardedHoldsCount = (int)$discardStmt->rowCount();

    $summary = computeShiftSummaryData($conn, $shiftId);
    if (!$summary || $summary['status'] !== 'open') {
      $conn->rollBack();
      http_response_code(422);
      return json_encode(["returnValue" => 0, "message" => "Shift #{$shiftId} is not open."]);
    }
    $summary['discarded_holds_count'] = $discardedHoldsCount;
    $summary['open_holds_count'] = 0;

    $expectedCash = $summary['expected_cash'];
    $varianceAmount = round($actualCountedCash - $expectedCash, 2);
    $varianceStatus = 'BALANCED';
    if (abs($varianceAmount) < 0.005) {
      $varianceAmount = 0.00;
      $varianceStatus = 'BALANCED';
    } elseif ($varianceAmount > 0) {
      $varianceStatus = 'OVER';
    } else {
      $varianceStatus = 'SHORT';
    }

    $closedAt = date('Y-m-d H:i:s');
    $supervisorFullName = trim($verifiedSupervisor['first_name'] . ' ' . $verifiedSupervisor['last_name']);

    $summary['closed_at'] = $closedAt;
    $summary['status'] = 'closed';
    $summary['actual_counted_cash'] = $actualCountedCash;
    $summary['variance_amount'] = $varianceAmount;
    $summary['variance_status'] = $varianceStatus;
    $summary['closed_by_supervisor_id'] = (int)$supervisorId;
    $summary['supervisor_name'] = $supervisorFullName;
    $summary['auth_log_id'] = $authLogId ? (int)$authLogId : null;

    $updStmt = $conn->prepare(
      "UPDATE tblshifts
       SET status = 'closed',
           closed_at = CURRENT_TIMESTAMP,
           closing_cash = :closingCash,
           expected_cash = :expectedCash,
           floats_added_total = :floatsAdded,
           current_float = :currentFloat,
           cash_sales_total = :cashSales,
           refunds_total = :refunds,
           lifts_total = :lifts,
           ar_sales_count = :arCount,
           ar_sales_total = :arTotal,
           variance_amount = :variance,
           closed_by_supervisor_id = :supervisorId,
           auth_log_id = :authLogId,
           summary_json = :summaryJson
       WHERE shift_id = :shiftId AND status = 'open'"
    );
    $updStmt->execute([
      ":closingCash" => $actualCountedCash,
      ":expectedCash" => $expectedCash,
      ":floatsAdded" => $summary['floats_added_total'],
      ":currentFloat" => $summary['current_float'],
      ":cashSales" => $summary['cash_sales_total'],
      ":refunds" => $summary['refunds_total'],
      ":lifts" => $summary['lifts_total'],
      ":arCount" => $summary['ar_sales_count'],
      ":arTotal" => $summary['ar_sales_total'],
      ":variance" => $varianceAmount,
      ":supervisorId" => $supervisorId,
      ":authLogId" => $authLogId ?: null,
      ":summaryJson" => json_encode($summary),
      ":shiftId" => $shiftId
    ]);

    $conn->commit();

    // Lock the session post-EOS so register operations are blocked and re-login is required
    $_SESSION['shift_closed_lock'] = true;

    return json_encode([
      "returnValue" => 1,
      "message" => "Shift #{$shiftId} closed and locked.",
      "summary" => $summary,
      "eosReport" => $summary
    ]);
  } catch (Throwable $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    return json_encode(["returnValue" => 0, "message" => "Failed to close shift: " . $e->getMessage()]);
  }
}

function getClosedShifts($user) {
  include "connection-pdo.php";
  $isCashier = ($user['role_name'] === 'Cashier');
  $where = $isCashier ? "WHERE s.status = 'closed' AND s.user_id = :userId" : "WHERE s.status = 'closed'";
  $sql = "SELECT s.shift_id, s.user_id, s.terminal_id, s.opening_cash, s.closing_cash, s.expected_cash,
                 s.floats_added_total, s.current_float, s.cash_sales_total, s.refunds_total, s.lifts_total,
                 s.ar_sales_count, s.ar_sales_total, s.variance_amount, s.opened_at, s.closed_at,
                 s.closed_by_supervisor_id, s.summary_json,
                 CONCAT(u.first_name, ' ', u.last_name) AS cashier_name,
                 t.terminal_name,
                 CONCAT(sup.first_name, ' ', sup.last_name) AS supervisor_name
          FROM tblshifts s
          INNER JOIN tblusers u ON u.user_id = s.user_id
          LEFT JOIN tblpos_terminals t ON t.pos_terminal_id = s.terminal_id
          LEFT JOIN tblusers sup ON sup.user_id = s.closed_by_supervisor_id
          {$where}
          ORDER BY s.closed_at DESC, s.shift_id DESC
          LIMIT 50";
  $stmt = $conn->prepare($sql);
  if ($isCashier) {
    $stmt->execute([":userId" => $user['user_id']]);
  } else {
    $stmt->execute();
  }
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
  $reports = [];
  foreach ($rows as $r) {
    if (!empty($r['summary_json'])) {
      $decoded = json_decode($r['summary_json'], true);
      if (is_array($decoded)) {
        $reports[] = $decoded;
        continue;
      }
    }
    $reports[] = computeShiftSummaryData($conn, (int)$r['shift_id']);
  }
  return json_encode(["returnValue" => 1, "shifts" => $reports]);
}

function recordDrawerEvent($json, $user) {
  include "connection-pdo.php";
  if (!empty($_SESSION['shift_closed_lock'])) {
    http_response_code(403);
    return json_encode(["returnValue" => 0, "message" => "Session is locked following End of Shift. Please log in again."]);
  }
  $data = json_decode($json, true) ?: [];
  $shiftId = filter_var($data['shiftId'] ?? ($data['shift_id'] ?? null), FILTER_VALIDATE_INT);
  if (!$shiftId) {
    $terminalId = resolveSessionTerminalId($conn, $user);
    $activeShift = findOpenShift($conn, $user['user_id'], $terminalId);
    $shiftId = $activeShift ? (int)$activeShift['shift_id'] : null;
  }
  $eventType = strtolower(trim($data['eventType'] ?? ($data['event_type'] ?? '')));
  $amount = filter_var($data['amount'] ?? null, FILTER_VALIDATE_FLOAT);
  $authorizedBy = filter_var($data['authorizedBy'] ?? ($data['authorized_by'] ?? null), FILTER_VALIDATE_INT) ?: $user['user_id'];
  $notes = trim((string)($data['notes'] ?? ''));

  if (!$shiftId || !in_array($eventType, ['float', 'lift', 'drop', 'refund'], true) || $amount === false || $amount <= 0) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "Invalid drawer event parameters."]);
  }

  $shiftCheck = $conn->prepare("SELECT shift_id, opening_cash, floats_added_total FROM tblshifts WHERE shift_id = :shiftId AND status = 'open'");
  $shiftCheck->execute([":shiftId" => $shiftId]);
  $shiftRow = $shiftCheck->fetch(PDO::FETCH_ASSOC);
  if (!$shiftRow) {
    http_response_code(403);
    return json_encode(["returnValue" => 0, "message" => "Active open shift is required to record a drawer event."]);
  }

  $conn->beginTransaction();
  $stmt = $conn->prepare(
    "INSERT INTO tbldrawer_events (shift_id, event_type, amount, authorized_by, notes, created_at)
     VALUES (:shiftId, :eventType, :amount, :authorizedBy, :notes, CURRENT_TIMESTAMP)"
  );
  $stmt->execute([
    ":shiftId" => $shiftId,
    ":eventType" => $eventType,
    ":amount" => round($amount, 2),
    ":authorizedBy" => $authorizedBy,
    ":notes" => $notes !== '' ? $notes : null
  ]);
  $eventId = (int)$conn->lastInsertId();

  // Recalculate drawer event totals for this shift
  $totalsStmt = $conn->prepare(
    "SELECT 
       COALESCE(SUM(CASE WHEN event_type = 'float' THEN amount ELSE 0 END), 0) AS total_floats,
       COALESCE(SUM(CASE WHEN event_type IN ('lift', 'drop') THEN amount ELSE 0 END), 0) AS total_lifts
     FROM tbldrawer_events WHERE shift_id = :shiftId"
  );
  $totalsStmt->execute([":shiftId" => $shiftId]);
  $totalsRow = $totalsStmt->fetch(PDO::FETCH_ASSOC);
  $totalFloats = round((float)($totalsRow['total_floats'] ?? 0), 2);
  $totalLifts = round((float)($totalsRow['total_lifts'] ?? 0), 2);
  $newCurrentFloat = round((float)$shiftRow['opening_cash'] + $totalFloats - $totalLifts, 2);

  $updShift = $conn->prepare(
    "UPDATE tblshifts SET floats_added_total = :fa, lifts_total = :lt, current_float = :cf WHERE shift_id = :sid"
  );
  $updShift->execute([":fa" => $totalFloats, ":lt" => $totalLifts, ":cf" => $newCurrentFloat, ":sid" => $shiftId]);
  $conn->commit();

  $eventStmt = $conn->prepare(
    "SELECT event_id, shift_id, event_type, amount, notes, created_at FROM tbldrawer_events WHERE event_id = :eventId"
  );
  $eventStmt->execute([":eventId" => $eventId]);
  $event = $eventStmt->fetch(PDO::FETCH_ASSOC);

  return json_encode([
    "returnValue" => 1,
    "event" => $event,
    "currentFloat" => $newCurrentFloat,
    "summary" => computeShiftSummaryData($conn, $shiftId)
  ]);
}

function searchArCustomers($query) {
  include "connection-pdo.php";
  $q = trim((string)$query);
  if ($q === '') {
    return json_encode(["returnValue" => 1, "customers" => []]);
  }
  $term = '%' . $q . '%';
  $stmt = $conn->prepare(
    "SELECT c.ar_customer_id, c.customer_name, c.contact_name, c.contact_phone,
            c.credit_limit,
            COALESCE(i.invoice_balance, 0) + COALESCE(s.pending_balance, 0) AS credit_exposure,
            c.credit_limit - COALESCE(i.invoice_balance, 0) - COALESCE(s.pending_balance, 0) AS available_credit,
            COALESCE(ov.overdue_count, 0) AS overdue_invoice_count,
            COALESCE(ov.overdue_balance, 0) AS overdue_balance
     FROM tblar_customers c
     LEFT JOIN (
       SELECT ar_customer_id, SUM(balance) AS invoice_balance FROM tblar_invoice
       WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0 GROUP BY ar_customer_id
     ) i ON i.ar_customer_id = c.ar_customer_id
     LEFT JOIN (
       SELECT ar_customer_id, COUNT(*) AS overdue_count, SUM(balance) AS overdue_balance FROM tblar_invoice
       WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0 AND due_date < CURRENT_DATE GROUP BY ar_customer_id
     ) ov ON ov.ar_customer_id = c.ar_customer_id
     LEFT JOIN (
       SELECT s.ar_customer_id, SUM(s.total_amount) AS pending_balance FROM tblsales s
       WHERE s.sale_type = 'AR' AND s.ar_customer_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM tblar_invoice ai WHERE ai.sale_id = s.sale_id)
       GROUP BY s.ar_customer_id
     ) s ON s.ar_customer_id = c.ar_customer_id
     WHERE c.is_active = 1
       AND (
         LOWER(c.customer_name) LIKE LOWER(:term)
         OR LOWER(COALESCE(c.contact_name, '')) LIKE LOWER(:term)
         OR LOWER(COALESCE(c.contact_phone, '')) LIKE LOWER(:term)
         OR CAST(c.ar_customer_id AS CHAR) LIKE :term
       )
     ORDER BY c.customer_name ASC
     LIMIT 10"
  );
  $stmt->execute([":term" => $term]);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
  $formatted = array_map(function($r) {
    return [
      "ar_customer_id" => (int)$r['ar_customer_id'],
      "customer_name" => $r['customer_name'],
      "contact_name" => $r['contact_name'] ?? '',
      "contact_phone" => $r['contact_phone'] ?? '',
      "credit_limit" => (float)$r['credit_limit'],
      "credit_exposure" => (float)$r['credit_exposure'],
      "available_credit" => (float)$r['available_credit'],
      "overdue_invoice_count" => (int)$r['overdue_invoice_count'],
      "overdue_balance" => (float)$r['overdue_balance']
    ];
  }, $rows);
  return json_encode(["returnValue" => 1, "customers" => $formatted]);
}

$operation = $_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['operation'] ?? '') : ($_POST['operation'] ?? '');
$json = $_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['json'] ?? '') : ($_POST['json'] ?? '');
switch ($operation) {
  case "getFormData": $user = requireRoles(["Admin", "Cashier", "Manager", "Supervisor"]); echo getFormData($user); break;
  case "searchArCustomers": requireRoles(["Admin", "Cashier", "Manager", "Supervisor"]); echo searchArCustomers($_GET['query'] ?? ($_POST['query'] ?? '')); break;
  case "getCreditEligibility": requireRoles(["Admin", "Cashier", "Manager", "Supervisor"]); echo getCreditEligibility((int)($_GET['customerId'] ?? 0)); break;
  case "getAllSales": requireRoles(["Admin", "Cashier", "Manager", "Supervisor"]); echo getAllSales(); break;
  case "getReceipt": requireRoles(["Admin", "Cashier", "Manager", "Supervisor"]); echo getReceipt((int)($_GET['saleId'] ?? 0)); break;
  case "createSale": requireRoles(["Cashier", "Admin", "Manager", "Supervisor"]); echo createSale($json); break;
  case "holdTransaction": $user = requireRoles(["Cashier", "Admin", "Manager", "Supervisor"]); echo holdTransaction($json, $user); break;
  case "getHeldTransactions": $user = requireRoles(["Cashier", "Admin", "Manager", "Supervisor"]); echo getHeldTransactions($user); break;
  case "resumeHeldTransaction": $user = requireRoles(["Cashier", "Admin", "Manager", "Supervisor"]); echo resumeHeldTransaction($json, $user); break;
  case "deleteHeldTransaction": requireRoles(["Cashier", "Admin", "Manager", "Supervisor"]); echo deleteHeldTransaction((int)($_POST['heldId'] ?? 0)); break;
  case "getActiveShift": $user = requireRoles(["Cashier", "Admin", "Manager", "Supervisor"]); echo getActiveShift($user); break;
  case "openShift": $user = requireRoles(["Cashier", "Admin", "Manager", "Supervisor"]); echo openShift($json, $user); break;
  case "getShiftSummary": $user = requireRoles(["Cashier", "Admin", "Manager", "Supervisor"]); echo getShiftSummary($user); break;
  case "closeShift": $user = requireRoles(["Cashier", "Admin", "Manager", "Supervisor"]); echo closeShift($json, $user); break;
  case "getClosedShifts": $user = requireRoles(["Cashier", "Admin", "Manager", "Supervisor"]); echo getClosedShifts($user); break;
  case "recordDrawerEvent": $user = requireRoles(["Cashier", "Admin", "Manager", "Supervisor"]); echo recordDrawerEvent($json, $user); break;
  default: http_response_code(400); echo json_encode(["message" => "Invalid sales operation."]);
}
?>
