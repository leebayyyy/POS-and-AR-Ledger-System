<?php
require_once "auth-lib.php";
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$user = requireRoles(["Admin", "Manager", "Accounts Receivable Staff", "Supervisor"]);
include "connection-pdo.php";
$operation = $_GET['operation'] ?? '';

function validReportDate($value) {
  if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
    return false;
  }
  [$year, $month, $day] = array_map('intval', explode('-', $value));
  return checkdate($month, $day, $year);
}

function reportAgingBucket($balance, $daysOverdue) {
  $bal = (float)$balance;
  $days = (int)$daysOverdue;
  if ($bal <= 0) return 'Paid';
  if ($days <= 0) return 'Current';
  if ($days <= 30) return '1-30 Days';
  if ($days <= 60) return '31-60 Days';
  return '60+ Days';
}

if ($operation === 'summary') {
  $date = $_GET['date'] ?? date('Y-m-d');
  if (!validReportDate($date)) {
    http_response_code(422);
    echo json_encode(["message" => "A valid report date is required."]);
    exit;
  }

  $salesStmt = $conn->prepare(
    "SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total,
            COALESCE(SUM(tax_total), 0) AS tax
     FROM tblsales
     WHERE sale_date = :reportDate"
  );
  $salesStmt->execute([":reportDate" => $date]);
  $sales = $salesStmt->fetch(PDO::FETCH_ASSOC);

  $ar = $conn->query(
    "SELECT COUNT(*) AS invoices, COALESCE(SUM(balance), 0) AS invoice_outstanding
     FROM tblar_invoice
     WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0"
  )->fetch(PDO::FETCH_ASSOC);
  $pendingSales = $conn->query(
    "SELECT COUNT(*) AS count, COALESCE(SUM(s.total_amount), 0) AS total
     FROM tblsales s
     WHERE s.sale_type='AR' AND s.ar_customer_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tblar_invoice i WHERE i.sale_id=s.sale_id)"
  )->fetch(PDO::FETCH_ASSOC);
  $ar['pending_sales'] = $pendingSales['count'];
  $ar['pending_sales_total'] = $pendingSales['total'];
  $ar['outstanding'] = (float)$ar['invoice_outstanding'] + (float)$pendingSales['total'];
  $overdue = $conn->query(
    "SELECT COUNT(*) AS count, COALESCE(SUM(balance), 0) AS balance
     FROM tblar_invoice
     WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0
       AND due_date < CURRENT_DATE"
  )->fetch(PDO::FETCH_ASSOC);
  $ar['overdue_invoices'] = (int)$overdue['count'];
  $ar['overdue_balance'] = $overdue['balance'];

  $paymentsStmt = $conn->prepare(
    "SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
     FROM tblpayment_header
     WHERE payment_date = :reportDate"
  );
  $paymentsStmt->execute([":reportDate" => $date]);
  $payments = $paymentsStmt->fetch(PDO::FETCH_ASSOC);

  $promotionSummaryStmt = $conn->prepare(
    "SELECT COUNT(DISTINCT s.sale_id) AS sale_count,
            COALESCE(SUM(d.promo_discount), 0) AS total_discount
     FROM tblsales s
     INNER JOIN tblsales_detail d ON d.sale_id=s.sale_id
     WHERE s.sale_date=:reportDate AND d.promo_id IS NOT NULL"
  );
  $promotionSummaryStmt->execute([":reportDate" => $date]);
  $promotionSummary = $promotionSummaryStmt->fetch(PDO::FETCH_ASSOC);

  $dailySalesStmt = $conn->prepare(
    "SELECT s.sale_id, s.sale_date, s.sale_type, s.total_amount, s.balance,
            COALESCE((SELECT SUM(sd.promo_discount) FROM tblsales_detail sd WHERE sd.sale_id=s.sale_id), 0) AS promotion_discount,
            t.terminal_name, CONCAT(u.first_name, ' ', u.last_name) AS cashier,
            pm.method_name AS payment_method,
            c.customer_name
     FROM tblsales s
     INNER JOIN tblpos_terminals t ON t.pos_terminal_id=s.pos_terminal_id
     INNER JOIN tblusers u ON u.user_id=s.cashier_user_id
     LEFT JOIN tblar_customers c ON c.ar_customer_id=s.ar_customer_id
     LEFT JOIN tblpayment_method pm ON pm.payment_method_id=s.payment_method_id
     WHERE s.sale_date=:reportDate
     ORDER BY s.sale_id DESC"
  );
  $dailySalesStmt->execute([":reportDate" => $date]);
  $dailySales = $dailySalesStmt->fetchAll(PDO::FETCH_ASSOC);
  if (!empty($dailySales)) {
    $promoRows = $conn->query(
      "SELECT DISTINCT sd.sale_id, pr.promo_name
       FROM tblsales_detail sd
       INNER JOIN tblpromo pr ON pr.promo_id = sd.promo_id
       ORDER BY pr.promo_name ASC"
    )->fetchAll(PDO::FETCH_ASSOC);
    $promoMap = [];
    foreach ($promoRows as $pr) {
      $promoMap[(int)$pr['sale_id']][] = $pr['promo_name'];
    }
    foreach ($dailySales as &$ds) {
      $sid = (int)$ds['sale_id'];
      $ds['promotions_applied'] = isset($promoMap[$sid]) ? implode(', ', $promoMap[$sid]) : null;
    }
    unset($ds);
  }

  $terminalSalesStmt = $conn->prepare(
    "SELECT t.pos_terminal_id, t.terminal_name, COUNT(s.sale_id) AS sale_count,
            COALESCE(SUM(s.total_amount), 0) AS sales_total
     FROM tblpos_terminals t
     LEFT JOIN tblsales s ON s.pos_terminal_id=t.pos_terminal_id AND s.sale_date=:reportDate
     GROUP BY t.pos_terminal_id, t.terminal_name
     ORDER BY t.terminal_name"
  );
  $terminalSalesStmt->execute([":reportDate"=>$date]);

  $invoices = $conn->query(
    "SELECT i.ar_invoice_id, i.ar_customer_id, i.invoice_number, i.invoice_date, i.due_date,
            COALESCE(i.principal_amount, i.invoice_amount) AS principal_amount,
            i.invoice_amount, i.balance, i.status, c.customer_name,
            CASE
              WHEN i.due_date IS NULL THEN 'No due date'
              WHEN i.due_date < CURRENT_DATE THEN 'Overdue'
              WHEN i.due_date = CURRENT_DATE THEN 'Due today'
              ELSE 'Current'
            END AS collection_status
     FROM tblar_invoice i
     INNER JOIN tblar_customers c ON c.ar_customer_id=i.ar_customer_id
     WHERE i.status <> 'Pending' AND COALESCE(balance, 0) > 0
     ORDER BY (CASE WHEN i.due_date < CURRENT_DATE THEN 1 ELSE 0 END) DESC, i.due_date ASC, c.customer_name, i.invoice_number"
  )->fetchAll(PDO::FETCH_ASSOC);

  // WP-5 5A.3: Aging buckets on AR ledger/report: Current, 1-30, 31-60, 60+
  $todayTs = strtotime(date('Y-m-d'));
  $agingBuckets = [
    "current" => ["label" => "Current", "count" => 0, "balance" => 0.00],
    "days_1_30" => ["label" => "1–30 Days", "count" => 0, "balance" => 0.00],
    "days_31_60" => ["label" => "31–60 Days", "count" => 0, "balance" => 0.00],
    "days_60_plus" => ["label" => "60+ Days", "count" => 0, "balance" => 0.00]
  ];
  $customerAgingMap = [];

  foreach ($invoices as &$inv) {
    $bal = round((float)$inv['balance'], 2);
    $cid = (int)$inv['ar_customer_id'];
    if (!isset($customerAgingMap[$cid])) {
      $customerAgingMap[$cid] = [
        "current" => 0.00,
        "days_1_30" => 0.00,
        "days_31_60" => 0.00,
        "days_60_plus" => 0.00
      ];
    }
    $daysOverdue = 0;
    if (!empty($inv['due_date'])) {
      $dueTs = strtotime(substr((string)$inv['due_date'], 0, 10));
      if ($dueTs && $todayTs > $dueTs) {
        $daysOverdue = (int)floor(($todayTs - $dueTs) / 86400);
      }
    }
    $inv['days_overdue'] = $daysOverdue;
    $bucket = reportAgingBucket($bal, $daysOverdue);
    $inv['aging_bucket'] = $bucket;

    if ($bucket === 'Current') {
      $agingBuckets['current']['count']++;
      $agingBuckets['current']['balance'] = round($agingBuckets['current']['balance'] + $bal, 2);
      $customerAgingMap[$cid]['current'] = round($customerAgingMap[$cid]['current'] + $bal, 2);
    } elseif ($bucket === '1-30 Days') {
      $agingBuckets['days_1_30']['count']++;
      $agingBuckets['days_1_30']['balance'] = round($agingBuckets['days_1_30']['balance'] + $bal, 2);
      $customerAgingMap[$cid]['days_1_30'] = round($customerAgingMap[$cid]['days_1_30'] + $bal, 2);
    } elseif ($bucket === '31-60 Days') {
      $agingBuckets['days_31_60']['count']++;
      $agingBuckets['days_31_60']['balance'] = round($agingBuckets['days_31_60']['balance'] + $bal, 2);
      $customerAgingMap[$cid]['days_31_60'] = round($customerAgingMap[$cid]['days_31_60'] + $bal, 2);
    } elseif ($bucket === '60+ Days') {
      $agingBuckets['days_60_plus']['count']++;
      $agingBuckets['days_60_plus']['balance'] = round($agingBuckets['days_60_plus']['balance'] + $bal, 2);
      $customerAgingMap[$cid]['days_60_plus'] = round($customerAgingMap[$cid]['days_60_plus'] + $bal, 2);
    }
  }
  unset($inv);

  $customerBalances = $conn->query(
    "SELECT c.ar_customer_id, c.customer_name, c.credit_limit,
            COALESCE(i.invoice_balance, 0) AS invoice_balance,
            COALESCE(i.open_invoice_count, 0) AS open_invoice_count,
            COALESCE(s.pending_balance, 0) AS pending_balance,
            COALESCE(s.pending_sale_count, 0) AS pending_sale_count,
            COALESCE(i.invoice_balance, 0) + COALESCE(s.pending_balance, 0) AS total_balance,
            c.credit_limit - COALESCE(i.invoice_balance, 0) - COALESCE(s.pending_balance, 0) AS available_credit
     FROM tblar_customers c
     LEFT JOIN (
       SELECT ar_customer_id, SUM(balance) AS invoice_balance, COUNT(*) AS open_invoice_count
       FROM tblar_invoice
       WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0
       GROUP BY ar_customer_id
     ) i ON i.ar_customer_id=c.ar_customer_id
     LEFT JOIN (
       SELECT s.ar_customer_id, SUM(s.total_amount) AS pending_balance, COUNT(*) AS pending_sale_count
       FROM tblsales s
       WHERE s.sale_type='AR' AND s.ar_customer_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM tblar_invoice ai WHERE ai.sale_id=s.sale_id)
       GROUP BY s.ar_customer_id
     ) s ON s.ar_customer_id=c.ar_customer_id
     WHERE COALESCE(i.invoice_balance, 0) > 0 OR COALESCE(s.pending_balance, 0) > 0 OR c.credit_limit > 0
     ORDER BY total_balance DESC, c.customer_name"
  )->fetchAll(PDO::FETCH_ASSOC);

  foreach ($customerBalances as &$cb) {
    $cid = (int)$cb['ar_customer_id'];
    $ca = $customerAgingMap[$cid] ?? ["current" => 0.00, "days_1_30" => 0.00, "days_31_60" => 0.00, "days_60_plus" => 0.00];
    $cb['current_balance'] = $ca['current'];
    $cb['days_1_30_balance'] = $ca['days_1_30'];
    $cb['days_31_60_balance'] = $ca['days_31_60'];
    $cb['days_60_plus_balance'] = $ca['days_60_plus'];
  }
  unset($cb);

  $dailyPaymentsStmt = $conn->prepare(
    "SELECT h.payment_id, h.payment_date, h.amount, h.reference_number,
            i.invoice_number, i.status AS invoice_status, i.balance AS invoice_balance,
            c.customer_name, m.method_name,
            CONCAT(u.first_name, ' ', u.last_name) AS processed_by
     FROM tblpayment_header h
     INNER JOIN tblpayment_detail d ON d.payment_id=h.payment_id
     INNER JOIN tblar_invoice i ON i.ar_invoice_id=d.ar_invoice_id
     INNER JOIN tblar_customers c ON c.ar_customer_id=i.ar_customer_id
     INNER JOIN tblpayment_method m ON m.payment_method_id=h.payment_method_id
     INNER JOIN tblusers u ON u.user_id=h.processed_by_user_id
     WHERE h.payment_date=:reportDate
     ORDER BY h.payment_id DESC"
  );
  $dailyPaymentsStmt->execute([":reportDate" => $date]);

  $ledgerEntries = [];
  try {
    $ledgerEntries = $conn->query(
      "SELECT e.entry_id, e.ar_customer_id, e.ar_invoice_id, e.shift_id, e.entry_type,
              e.amount, e.balance_before, e.balance_after, e.reason, e.reference_no, e.created_at,
              c.customer_name, i.invoice_number,
              CONCAT(sup.first_name, ' ', sup.last_name) AS supervisor_name,
              CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
       FROM tblar_ledger_entries e
       INNER JOIN tblar_customers c ON c.ar_customer_id = e.ar_customer_id
       LEFT JOIN tblar_invoice i ON i.ar_invoice_id = e.ar_invoice_id
       LEFT JOIN tblusers sup ON sup.user_id = e.authorized_by_supervisor_id
       LEFT JOIN tblusers u ON u.user_id = e.created_by_user_id
       ORDER BY e.entry_id DESC"
    )->fetchAll(PDO::FETCH_ASSOC);
  } catch (Throwable $e) {
    // Table may not exist before WP-5 migration
  }

  echo json_encode([
    "date" => $date,
    "sales" => $sales,
    "ar" => $ar,
    "agingBuckets" => $agingBuckets,
    "payments" => $payments,
    "promotions" => $promotionSummary,
    "dailySales" => $dailySales,
    "terminalSales" => $terminalSalesStmt->fetchAll(PDO::FETCH_ASSOC),
    "invoices" => $invoices,
    "customerBalances" => $customerBalances,
    "dailyPayments" => $dailyPaymentsStmt->fetchAll(PDO::FETCH_ASSOC),
    "ledgerEntries" => $ledgerEntries
  ]);
  exit;
}

http_response_code(400);
echo json_encode(["message" => "Invalid report operation."]);
?>
