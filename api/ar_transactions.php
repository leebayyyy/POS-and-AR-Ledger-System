<?php
require_once "auth-lib.php";
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
$user = requireRoles(["Admin", "Accounts Receivable Staff", "Manager", "Supervisor"]);
include "connection-pdo.php";
$operation = $_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['operation'] ?? '') : ($_POST['operation'] ?? '');
$json = $_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['json'] ?? '') : ($_POST['json'] ?? '');
$data = json_decode($json, true) ?? [];

function validDate($value) {
  if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
    return false;
  }
  [$year, $month, $day] = array_map('intval', explode('-', $value));
  return checkdate($month, $day, $year);
}

if ($operation === 'getData') {
  $invoices = $conn->query(
    "SELECT i.ar_invoice_id, i.invoice_number, i.invoice_date, i.due_date,
            i.invoice_amount, i.balance, i.status, c.customer_name,
            CASE
              WHEN COALESCE(i.balance, 0) <= 0 THEN 'Paid'
              WHEN i.due_date IS NULL THEN 'No due date'
              WHEN i.due_date < CURRENT_DATE THEN 'Overdue'
              WHEN i.due_date = CURRENT_DATE THEN 'Due today'
              ELSE 'Current'
            END AS collection_status,
            CASE
              WHEN COALESCE(i.balance, 0) > 0 AND i.due_date < CURRENT_DATE
              THEN (CURRENT_DATE - i.due_date)
              ELSE 0
            END AS days_overdue
     FROM tblar_invoice i
     INNER JOIN tblar_customers c ON c.ar_customer_id=i.ar_customer_id
     WHERE i.status <> 'Pending'
     ORDER BY (CASE WHEN COALESCE(i.balance, 0) > 0 AND i.due_date < CURRENT_DATE THEN 1 ELSE 0 END) DESC,
              i.due_date ASC, i.ar_invoice_id DESC"
  )->fetchAll(PDO::FETCH_ASSOC);
  $memos = $conn->query(
    "SELECT 'Credit' AS memo_type, m.credit_memo_id AS memo_id, m.ar_invoice_id,
            i.invoice_number, c.customer_name, m.issue_date, m.amount, m.status,
            CONCAT(u.first_name, ' ', u.last_name) AS issued_by
     FROM tblar_credit_memo m
     INNER JOIN tblar_invoice i ON i.ar_invoice_id=m.ar_invoice_id
     INNER JOIN tblar_customers c ON c.ar_customer_id=i.ar_customer_id
     INNER JOIN tblusers u ON u.user_id=m.issued_by_user_id
     UNION ALL
     SELECT 'Debit', m.debit_memo_id, m.ar_invoice_id,
            i.invoice_number, c.customer_name, m.issue_date, m.amount, m.status,
            CONCAT(u.first_name, ' ', u.last_name)
     FROM tblar_debit_memo m
     INNER JOIN tblar_invoice i ON i.ar_invoice_id=m.ar_invoice_id
     INNER JOIN tblar_customers c ON c.ar_customer_id=i.ar_customer_id
     INNER JOIN tblusers u ON u.user_id=m.issued_by_user_id
     ORDER BY issue_date DESC, memo_id DESC"
  )->fetchAll(PDO::FETCH_ASSOC);
  // Auto-approve any unbilled AR sales and pending invoices on creation/loading
  $unbilled = $conn->query(
    "SELECT s.sale_id, s.sale_date, s.total_amount, s.ar_customer_id, s.cashier_user_id, COALESCE(ct.days, 30) AS days
     FROM tblsales s
     INNER JOIN tblar_customers c ON c.ar_customer_id=s.ar_customer_id
     LEFT JOIN tblar_customer_types ct ON ct.customer_type_id=c.customer_type_id
     WHERE s.sale_type='AR' AND NOT EXISTS (SELECT 1 FROM tblar_invoice i WHERE i.sale_id=s.sale_id)"
  )->fetchAll(PDO::FETCH_ASSOC);
  foreach ($unbilled as $ub) {
    $invNumber = "INV-" . str_pad((string)$ub['sale_id'], 8, "0", STR_PAD_LEFT);
    $ins = $conn->prepare(
      "INSERT INTO tblar_invoice (invoice_number, ar_customer_id, sale_id, created_by_user_id, invoice_date, due_date, invoice_amount, balance, status)
       VALUES (:number, :customerId, :saleId, :userId, :saleDate, DATE_ADD(CAST(:saleDate2 AS DATE), INTERVAL CAST(:days AS SIGNED) DAY), :amount, :balance, 'Approved')"
    );
    $ins->execute([
      ":number" => $invNumber,
      ":customerId" => $ub['ar_customer_id'],
      ":saleId" => $ub['sale_id'],
      ":userId" => $ub['cashier_user_id'],
      ":saleDate" => $ub['sale_date'],
      ":saleDate2" => $ub['sale_date'],
      ":days" => (int)$ub['days'],
      ":amount" => $ub['total_amount'],
      ":balance" => $ub['total_amount']
    ]);
  }
  $conn->query("UPDATE tblar_invoice SET status='Approved' WHERE status='Pending'");

  $invoices = $conn->query(
    "SELECT i.ar_invoice_id, i.invoice_number, i.invoice_date, i.due_date,
            i.invoice_amount, i.balance, i.status, c.customer_name,
            CASE
              WHEN COALESCE(i.balance, 0) <= 0 THEN 'Paid'
              WHEN i.due_date IS NULL THEN 'No due date'
              WHEN i.due_date < CURRENT_DATE THEN 'Overdue'
              WHEN i.due_date = CURRENT_DATE THEN 'Due today'
              ELSE 'Current'
            END AS collection_status,
            CASE
              WHEN COALESCE(i.balance, 0) > 0 AND i.due_date < CURRENT_DATE
              THEN DATEDIFF(CURRENT_DATE, i.due_date)
              ELSE 0
            END AS days_overdue
     FROM tblar_invoice i
     INNER JOIN tblar_customers c ON c.ar_customer_id=i.ar_customer_id
     ORDER BY (CASE WHEN COALESCE(i.balance, 0) > 0 AND i.due_date < CURRENT_DATE THEN 1 ELSE 0 END) DESC,
              i.due_date ASC, i.ar_invoice_id DESC"
  )->fetchAll(PDO::FETCH_ASSOC);
  $memos = $conn->query(
    "SELECT 'Credit' AS memo_type, m.credit_memo_id AS memo_id, m.ar_invoice_id,
            i.invoice_number, c.customer_name, m.issue_date, m.amount, m.status,
            CONCAT(u.first_name, ' ', u.last_name) AS issued_by
     FROM tblar_credit_memo m
     INNER JOIN tblar_invoice i ON i.ar_invoice_id=m.ar_invoice_id
     INNER JOIN tblar_customers c ON c.ar_customer_id=i.ar_customer_id
     INNER JOIN tblusers u ON u.user_id=m.issued_by_user_id
     UNION ALL
     SELECT 'Debit', m.debit_memo_id, m.ar_invoice_id,
            i.invoice_number, c.customer_name, m.issue_date, m.amount, m.status,
            CONCAT(u.first_name, ' ', u.last_name)
     FROM tblar_debit_memo m
     INNER JOIN tblar_invoice i ON i.ar_invoice_id=m.ar_invoice_id
     INNER JOIN tblar_customers c ON c.ar_customer_id=i.ar_customer_id
     INNER JOIN tblusers u ON u.user_id=m.issued_by_user_id
     ORDER BY issue_date DESC, memo_id DESC"
  )->fetchAll(PDO::FETCH_ASSOC);
  echo json_encode([
    "invoices" => $invoices,
    "memos" => $memos,
    "customers" => $conn->query("SELECT ar_customer_id, customer_name FROM tblar_customers WHERE is_active=1 ORDER BY customer_name")->fetchAll(PDO::FETCH_ASSOC),
    "sales" => [],
    "canManageAr" => in_array($user['role_name'], ['Admin', 'Accounts Receivable Staff'], true)
  ]);
  exit;
}

if ($operation === 'createInvoice') {
  if (!in_array($user['role_name'], ['Admin', 'Accounts Receivable Staff'], true)) {
    http_response_code(403);
    echo json_encode(["message"=>"Only Admin and AR Staff can create invoices."]);
    exit;
  }
  $saleId = (int)($data['saleId'] ?? 0);
  $invoiceDate = $data['invoiceDate'] ?? '';
  $dueDate = $data['dueDate'] ?? '';
  if ($saleId <= 0 || !validDate($invoiceDate) || !validDate($dueDate) || $dueDate < $invoiceDate) {
    http_response_code(422);
    echo json_encode(["message"=>"Sale, valid invoice date, and due date on or after the invoice date are required."]);
    exit;
  }
  try {
    $conn->beginTransaction();
    $saleStmt = $conn->prepare(
      "SELECT s.sale_id, s.sale_date, s.ar_customer_id, s.total_amount
       FROM tblsales s
       WHERE s.sale_id=:saleId AND s.sale_type='AR'
       FOR UPDATE"
    );
    $saleStmt->execute([":saleId"=>$saleId]);
    $sale = $saleStmt->fetch(PDO::FETCH_ASSOC);
    if (!$sale || empty($sale['ar_customer_id'])) {
      throw new RuntimeException("An AR sale linked to an active AR customer is required.");
    }

    $customerStmt = $conn->prepare(
      "SELECT ar_customer_id FROM tblar_customers
       WHERE ar_customer_id=:customerId AND is_active=1"
    );
    $customerStmt->execute([":customerId"=>$sale['ar_customer_id']]);
    if (!$customerStmt->fetchColumn()) {
      throw new RuntimeException("The AR customer for this sale is no longer active.");
    }

    $invoiceAmount = round((float)($data['invoiceAmount'] ?? 0), 2);
    $saleTotal = round((float)$sale['total_amount'], 2);
    if ($invoiceAmount <= 0 || $invoiceAmount !== $saleTotal) {
      throw new RuntimeException("Invoice amount must match the recorded sale total.");
    }
    $balance = round((float)($data['balance'] ?? 0), 2);
    if ($balance !== $invoiceAmount) {
      throw new RuntimeException("The initial invoice balance must match the invoice amount.");
    }

    $legacyStmt = $conn->prepare(
      "SELECT ar_invoice_id, status FROM tblar_invoice WHERE sale_id=:saleId FOR UPDATE"
    );
    $legacyStmt->execute([":saleId"=>$saleId]);
    $existingInvoice = $legacyStmt->fetch(PDO::FETCH_ASSOC);
    $invoiceNumber = "INV-" . str_pad((string)$saleId, 8, "0", STR_PAD_LEFT);
    if ($existingInvoice) {
      $update = $conn->prepare(
        "UPDATE tblar_invoice
         SET invoice_number=:number, created_by_user_id=:userId, invoice_date=:invoiceDate,
             due_date=:dueDate, invoice_amount=:amount, balance=:balance, status='Approved'
         WHERE ar_invoice_id=:invoiceId"
      );
      $update->execute([
        ":number"=>$invoiceNumber,
        ":userId"=>$user['user_id'],
        ":invoiceDate"=>$invoiceDate,
        ":dueDate"=>$dueDate,
        ":amount"=>$invoiceAmount,
        ":balance"=>$balance,
        ":invoiceId"=>$existingInvoice['ar_invoice_id']
      ]);
    } else {
      $insert = $conn->prepare(
        "INSERT INTO tblar_invoice
          (invoice_number, ar_customer_id, sale_id, created_by_user_id, invoice_date, due_date, invoice_amount, balance, status)
         VALUES (:number, :customerId, :saleId, :userId, :invoiceDate, :dueDate, :amount, :balance, 'Approved')"
      );
      $insert->execute([
        ":number"=>$invoiceNumber,
        ":customerId"=>$sale['ar_customer_id'],
        ":saleId"=>$saleId,
        ":userId"=>$user['user_id'],
        ":invoiceDate"=>$invoiceDate,
        ":dueDate"=>$dueDate,
        ":amount"=>$invoiceAmount,
        ":balance"=>$balance
      ]);
    }
    $conn->commit();
    echo json_encode(["returnValue"=>1, "invoiceNumber"=>$invoiceNumber]);
    exit;
  } catch (Throwable $e) {
    if ($conn->inTransaction()) {
      $conn->rollBack();
    }
    http_response_code(422);
    echo json_encode(["message"=>$e->getMessage()]);
    exit;
  }
}

if ($operation === 'createMemo') {
  if (!in_array($user['role_name'], ['Admin', 'Accounts Receivable Staff'], true)) {
    http_response_code(403);
    echo json_encode(["message"=>"Only Admin and AR Staff can create memos."]);
    exit;
  }
  $type = $data['memoType'] ?? '';
  $rawAmount = is_scalar($data['amount'] ?? null) ? (string)$data['amount'] : '';
  $amountMatches = preg_match('/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/', $rawAmount);
  $invoiceId = filter_var($data['invoiceId'] ?? null, FILTER_VALIDATE_INT);
  if (!in_array($type, ['Credit', 'Debit'], true) || !$amountMatches || (float)$rawAmount <= 0 ||
      !$invoiceId || $invoiceId < 1) {
    http_response_code(422);
    echo json_encode(["message"=>"Memo type, invoice, and a positive amount with up to two decimal places are required."]);
    exit;
  }
  [$wholeAmount, $fractionAmount] = array_pad(explode('.', $rawAmount, 2), 2, '');
  $amountCents = (int)$wholeAmount * 100 + (int)str_pad($fractionAmount, 2, '0');
  $amount = number_format($amountCents / 100, 2, '.', '');
  try {
    $conn->beginTransaction();
    $invoiceStmt = $conn->prepare(
      "SELECT balance, invoice_amount, status FROM tblar_invoice
       WHERE ar_invoice_id=:invoiceId AND status <> 'Pending' FOR UPDATE"
    );
    $invoiceStmt->execute([":invoiceId"=>$invoiceId]);
    $invoice = $invoiceStmt->fetch(PDO::FETCH_ASSOC);
    if (!$invoice || (float)$invoice['balance'] <= 0) {
      throw new RuntimeException("Select an existing invoice with an outstanding balance.");
    }
    if ($type === 'Credit' && $amountCents > (int)round((float)$invoice['balance'] * 100)) {
      throw new RuntimeException("Credit memo amount cannot exceed the outstanding invoice balance.");
    }
    $table = $type === 'Credit' ? 'tblar_credit_memo' : 'tblar_debit_memo';
    $columns = $type === 'Credit' ? "(ar_invoice_id, issue_date, amount, invoice_balance, issued_by_user_id, status)" : "(ar_invoice_id, issue_date, amount, issued_by_user_id, status)";
    $values = $type === 'Credit' ? "(:invoiceId, CURRENT_DATE, :amount, :balance, :userId, 'Approved')" : "(:invoiceId, CURRENT_DATE, :amount, :userId, 'Approved')";
    $stmt = $conn->prepare("INSERT INTO {$table} {$columns} VALUES {$values}");
    $balanceCents = (int)round((float)$invoice['balance'] * 100);
    $invoiceAmountCents = (int)round((float)$invoice['invoice_amount'] * 100);
    if ($balanceCents > $invoiceAmountCents) {
      throw new RuntimeException("Invoice balance cannot exceed its invoice amount.");
    }
    if ($type === 'Credit' && $amountCents > $invoiceAmountCents) {
      throw new RuntimeException("Credit memo amount cannot exceed the invoice amount.");
    }
    $newBalanceCents = $type === 'Credit' ? $balanceCents - $amountCents : $balanceCents + $amountCents;
    $newInvoiceAmountCents = $type === 'Debit'
      ? $invoiceAmountCents + $amountCents
      : $invoiceAmountCents - $amountCents;
    if ($newInvoiceAmountCents > 9999999999) {
      throw new RuntimeException("The adjusted invoice amount exceeds the supported limit.");
    }
    $newBalance = number_format($newBalanceCents / 100, 2, '.', '');
    $newInvoiceAmount = number_format($newInvoiceAmountCents / 100, 2, '.', '');
    $params = [":invoiceId"=>$invoiceId, ":amount"=>$amount, ":userId"=>$user['user_id']];
    if ($type === 'Credit') {
      $params[":balance"] = $newBalance;
    }
    $stmt->execute($params);
    $newStatus = $newBalanceCents <= 0
      ? 'Paid'
      : ($newBalanceCents < $newInvoiceAmountCents ? 'Partially Paid' : 'Open');
    $update = $conn->prepare(
      "UPDATE tblar_invoice SET invoice_amount=:invoiceAmount, balance=:balance, status=:status
       WHERE ar_invoice_id=:invoiceId"
    );
    $update->execute([
      ":invoiceAmount"=>$newInvoiceAmount,
      ":balance"=>$newBalance,
      ":status"=>$newStatus,
      ":invoiceId"=>$invoiceId
    ]);
    $conn->commit();
    echo json_encode([
      "returnValue"=>1,
      "memoType"=>$type,
      "invoiceAmount"=>$newInvoiceAmount,
      "remainingBalance"=>$newBalance,
      "invoiceStatus"=>$newStatus
    ]);
    exit;
  } catch (Throwable $e) {
    if ($conn->inTransaction()) {
      $conn->rollBack();
    }
    http_response_code(422);
    echo json_encode(["message"=>$e->getMessage()]);
    exit;
  }
}
http_response_code(400);
echo json_encode(["message"=>"Invalid AR operation."]);
?>
