<?php
require_once "auth-lib.php";
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$operation = $_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['operation'] ?? '') : ($_POST['operation'] ?? '');
$json = $_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['json'] ?? '') : ($_POST['json'] ?? '');
$data = json_decode($json, true);

if ($operation === 'getAllPosTerminals') {
  requireRoles(["Admin", "Cashier", "Manager", "Supervisor"]);
  include "connection-pdo.php";
  $rows = $conn->query(
    "SELECT t.pos_terminal_id, t.terminal_name,
            t.machine_identifier, t.device_token, t.ip_address, COALESCE(t.is_active, 1) AS is_active,
            (SELECT COUNT(*) FROM tblusers u WHERE u.assigned_terminal_id = t.pos_terminal_id AND u.is_active = 1) AS assigned_cashiers_count
     FROM tblpos_terminals t
     ORDER BY t.pos_terminal_id ASC"
  )->fetchAll(PDO::FETCH_ASSOC);
  echo json_encode($rows);
  exit;
}

if ($operation === 'selectTerminal') {
  $cashier = requireRoles(["Cashier"]);
  include "connection-pdo.php";
  // WP-2: Cashiers are strictly bound to their assigned terminal; reject manual override to a different terminal
  $assignedId = !empty($cashier['assigned_terminal_id']) ? (int)$cashier['assigned_terminal_id'] : null;
  $terminalId = filter_var($data['terminalId'] ?? null, FILTER_VALIDATE_INT);
  if ($assignedId && $terminalId && (int)$terminalId !== $assignedId) {
    http_response_code(403);
    echo json_encode(["returnValue" => 0, "message" => "Cashiers are locked to their assigned terminal (#{$assignedId})."]);
    exit;
  }
  $resolvedId = $assignedId ?: $terminalId;
  if (!$resolvedId || $resolvedId < 1) {
    http_response_code(422);
    echo json_encode(["message"=>"Select a valid POS terminal."]);
    exit;
  }
  $terminalStmt = $conn->prepare(
    "SELECT pos_terminal_id, terminal_name FROM tblpos_terminals WHERE pos_terminal_id=:terminalId"
  );
  $terminalStmt->execute([":terminalId"=>$resolvedId]);
  $terminal = $terminalStmt->fetch(PDO::FETCH_ASSOC);
  if (!$terminal) {
    http_response_code(422);
    echo json_encode(["message"=>"The selected POS terminal is unavailable."]);
    exit;
  }
  $_SESSION['pos_terminal_id'] = (int)$terminal['pos_terminal_id'];
  echo json_encode([
    "returnValue"=>1,
    "selectedTerminal"=>[
      "pos_terminal_id"=>(int)$terminal['pos_terminal_id'],
      "terminal_name"=>$terminal['terminal_name']
    ],
    "cashier_user_id"=>(int)$cashier['user_id']
  ]);
  exit;
}

requireRoles(["Admin", "Manager", "Supervisor"]);
include "connection-pdo.php";

if ($operation === 'getPosTerminal') {
  $terminalId = filter_var($data['posTerminalId'] ?? null, FILTER_VALIDATE_INT);
  if (!$terminalId || $terminalId < 1) {
    http_response_code(422);
    echo json_encode(["message"=>"A valid POS terminal is required."]);
    exit;
  }
  $stmt = $conn->prepare(
    "SELECT pos_terminal_id, terminal_name, machine_identifier, device_token, ip_address, COALESCE(is_active, 1) AS is_active
     FROM tblpos_terminals WHERE pos_terminal_id=:id"
  );
  $stmt->execute([":id"=>$terminalId]);
  echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
  exit;
}

if ($operation === 'insertPosTerminal') {
  $name = trim((string)($data['terminalName'] ?? ''));
  $machineIdentifier = trim((string)($data['machineIdentifier'] ?? ''));
  $deviceToken = trim((string)($data['deviceToken'] ?? ''));
  $ipAddress = trim((string)($data['ipAddress'] ?? ''));
  if ($name === '' || strlen($name) > 150) {
    http_response_code(422);
    echo json_encode(["message"=>"Enter a terminal name up to 150 characters."]);
    exit;
  }
  if ($machineIdentifier === '') {
    $machineIdentifier = 'TERM-' . strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $name), 0, 8));
  }
  if ($deviceToken === '') {
    $deviceToken = 'TOKEN-' . strtoupper(bin2hex(random_bytes(3)));
  }
  $stmt = $conn->prepare(
    "INSERT INTO tblpos_terminals(terminal_name, machine_identifier, device_token, ip_address, is_active)
     VALUES(:terminalName, :machineId, :deviceToken, :ipAddr, 1)"
  );
  $stmt->execute([
    ":terminalName" => $name,
    ":machineId" => $machineIdentifier,
    ":deviceToken" => $deviceToken,
    ":ipAddr" => $ipAddress ?: null
  ]);
  echo json_encode(1);
  exit;
}

if ($operation === 'updatePosTerminal') {
  $terminalId = filter_var($data['posTerminalId'] ?? null, FILTER_VALIDATE_INT);
  $name = trim((string)($data['terminalName'] ?? ''));
  $machineIdentifier = trim((string)($data['machineIdentifier'] ?? ''));
  $deviceToken = trim((string)($data['deviceToken'] ?? ''));
  $ipAddress = trim((string)($data['ipAddress'] ?? ''));
  if (!$terminalId || $terminalId < 1 || $name === '' || strlen($name) > 150) {
    http_response_code(422);
    echo json_encode(["message"=>"Enter a valid terminal and name up to 150 characters."]);
    exit;
  }
  $stmt = $conn->prepare(
    "UPDATE tblpos_terminals
     SET terminal_name = :name,
         machine_identifier = COALESCE(NULLIF(:machineId, ''), machine_identifier),
         device_token = COALESCE(NULLIF(:deviceToken, ''), device_token),
         ip_address = :ipAddr
     WHERE pos_terminal_id = :id"
  );
  $stmt->execute([
    ":name" => $name,
    ":machineId" => $machineIdentifier,
    ":deviceToken" => $deviceToken,
    ":ipAddr" => $ipAddress ?: null,
    ":id" => $terminalId
  ]);
  echo json_encode(1);
  exit;
}

if ($operation === 'setDefaultLocalhostTerminal') {
  $terminalId = filter_var($data['posTerminalId'] ?? null, FILTER_VALIDATE_INT);
  if (!$terminalId || $terminalId < 1) {
    http_response_code(422);
    echo json_encode(["returnValue" => 0, "message" => "A valid POS terminal ID is required."]);
    exit;
  }
  $chk = $conn->prepare("SELECT pos_terminal_id, terminal_name, device_token, machine_identifier FROM tblpos_terminals WHERE pos_terminal_id = :id");
  $chk->execute([":id" => $terminalId]);
  $term = $chk->fetch(PDO::FETCH_ASSOC);
  if (!$term) {
    http_response_code(404);
    echo json_encode(["returnValue" => 0, "message" => "Terminal not found."]);
    exit;
  }
  $upd = $conn->prepare("UPDATE tblsystem_settings SET setting_value = :val, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'default_localhost_terminal_id'");
  $upd->execute([":val" => (string)$terminalId]);
  if ($upd->rowCount() === 0) {
    try {
      $ins = $conn->prepare("INSERT INTO tblsystem_settings (setting_key, setting_value) VALUES ('default_localhost_terminal_id', :val)");
      $ins->execute([":val" => (string)$terminalId]);
    } catch (Throwable $e) {
      // Ignore if already exists with same value
    }
  }
  $_SESSION['pos_terminal_id'] = (int)$terminalId;
  echo json_encode([
    "returnValue" => 1,
    "terminal" => $term,
    "message" => "Default localhost workstation bound to {$term['terminal_name']}."
  ]);
  exit;
}

if ($operation === 'deletePosTerminal') {
  $terminalId = filter_var($data['posTerminalId'] ?? null, FILTER_VALIDATE_INT);
  if (!$terminalId || $terminalId < 1) {
    http_response_code(422);
    echo json_encode(["message"=>"A valid POS terminal is required."]);
    exit;
  }
  $salesCheck = $conn->prepare("SELECT COUNT(*) FROM tblsales WHERE pos_terminal_id=:id");
  $salesCheck->execute([":id"=>$terminalId]);
  if ((int)$salesCheck->fetchColumn() > 0) {
    echo json_encode(["returnValue"=>0, "message"=>"Cannot delete this terminal: it already has sales transactions recorded."]);
    exit;
  }
  $stmt = $conn->prepare("DELETE FROM tblpos_terminals WHERE pos_terminal_id=:id");
  $stmt->execute([":id"=>$terminalId]);
  echo json_encode($stmt->rowCount() > 0 ? 1 : 0);
  exit;
}

http_response_code(400);
echo json_encode(["message"=>"Invalid POS terminal operation."]);
?>
