<?php
require_once "auth-lib.php";
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Credentials: true');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: Sat, 01 Jan 2000 00:00:00 GMT");

function login($json) {
  include "connection-pdo.php";
  $data = [];
  if (is_array($json)) {
    $data = $json;
  } elseif (is_string($json) && trim($json) !== '') {
    $data = json_decode($json, true) ?: [];
  }
  if (empty($data)) {
    $rawInput = file_get_contents('php://input');
    if ($rawInput) {
      $data = json_decode($rawInput, true) ?: [];
    }
  }
  if (empty($data)) {
    $data = $_POST;
  }
  $username = trim($data['username'] ?? '');
  $password = $data['password'] ?? '';

  $stmt = $conn->prepare(
    "SELECT u.user_id, u.username, u.first_name, u.last_name, u.password_hash,
            u.assigned_terminal_id, t.terminal_name AS assigned_terminal_name,
            r.role_id, r.role_name
     FROM tblusers u
     INNER JOIN tblroles r ON u.role_id = r.role_id
     LEFT JOIN tblpos_terminals t ON t.pos_terminal_id = u.assigned_terminal_id
     WHERE LOWER(TRIM(u.username)) = LOWER(TRIM(:username)) AND u.is_active = 1"
  );
  $stmt->execute([":username" => $username]);
  $user = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$user || !$user['password_hash'] || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    return json_encode(["message" => "Invalid username or password."]);
  }
  $user['role_name'] = normalizeRoleName($user['role_name']);

  // WP-2: Server-side auto terminal detection & Cashier lock enforcement
  $detectedTerminal = detectClientTerminal($conn, $data);
  $detectedTerminalId = $detectedTerminal ? (int)$detectedTerminal['pos_terminal_id'] : null;
  $detectedTerminalName = $detectedTerminal['terminal_name'] ?? null;

  if (strtolower(trim($user['role_name'])) === 'cashier') {
    $assignedTerminalId = !empty($user['assigned_terminal_id']) ? (int)$user['assigned_terminal_id'] : null;
    if (!$assignedTerminalId) {
      http_response_code(403);
      return json_encode([
        "returnValue" => 0,
        "message" => "This cashier account is not assigned to any POS terminal. Please contact an Administrator."
      ]);
    }
    if (!$detectedTerminalId) {
      http_response_code(403);
      return json_encode([
        "returnValue" => 0,
        "message" => "This workstation is not registered as an active POS terminal."
      ]);
    }
    if ($detectedTerminalId !== $assignedTerminalId) {
      $assignedLabel = $user['assigned_terminal_name']
        ? "{$user['assigned_terminal_name']} (Terminal {$assignedTerminalId})"
        : "Terminal {$assignedTerminalId}";
      $detectedLabel = $detectedTerminalName
        ? "{$detectedTerminalName} (Terminal {$detectedTerminalId})"
        : "Terminal {$detectedTerminalId}";
      http_response_code(403);
      return json_encode([
        "returnValue" => 0,
        "assignedTerminalId" => $assignedTerminalId,
        "assignedTerminalName" => $user['assigned_terminal_name'] ?? "Terminal {$assignedTerminalId}",
        "detectedTerminalId" => $detectedTerminalId,
        "detectedTerminalName" => $detectedTerminalName,
        "message" => "This account is assigned to {$assignedLabel}. Login from {$detectedLabel} is not permitted."
      ]);
    }
  }

  session_regenerate_id(true);
  unset($user['password_hash']);
  $_SESSION['user'] = $user;
  if ($detectedTerminalId) {
    $_SESSION['pos_terminal_id'] = $detectedTerminalId;
  } else {
    unset($_SESSION['pos_terminal_id']);
  }
  unset($_SESSION['shift_closed_lock']);

  return json_encode([
    "returnValue" => 1,
    "user" => $user,
    "selectedTerminalId" => $detectedTerminalId,
    "selectedTerminalName" => $detectedTerminalName,
    "detectedTerminal" => $detectedTerminal
  ]);
}

function logout() {
  $_SESSION = [];
  if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params["path"], $params["domain"], $params["secure"], $params["httponly"]);
  }
  session_destroy();
  return json_encode(["returnValue" => 1]);
}

function detectWorkstationInfo($json = '') {
  include "connection-pdo.php";
  $data = [];
  if (is_array($json)) {
    $data = $json;
  } elseif (is_string($json) && trim($json) !== '') {
    $data = json_decode($json, true) ?: [];
  }
  $detected = detectClientTerminal($conn, $data);
  $terminals = [];
  try {
    $terminals = $conn->query(
      "SELECT pos_terminal_id, terminal_name, machine_identifier, device_token, ip_address, COALESCE(is_active, 1) AS is_active
       FROM tblpos_terminals
       WHERE COALESCE(is_active, 1) = 1
       ORDER BY pos_terminal_id ASC"
    )->fetchAll(PDO::FETCH_ASSOC);
  } catch (Throwable $e) {
    $terminals = $conn->query(
      "SELECT pos_terminal_id, terminal_name FROM tblpos_terminals ORDER BY pos_terminal_id ASC"
    )->fetchAll(PDO::FETCH_ASSOC);
  }
  return json_encode([
    "returnValue" => 1,
    "detectedTerminal" => $detected,
    "terminals" => $terminals
  ]);
}

function sessionInfo() {
  if (!empty($_SESSION['shift_closed_lock'])) {
    // Session was locked by End of Shift (EOS) — require fresh login
    unset($_SESSION['user']);
    unset($_SESSION['pos_terminal_id']);
    unset($_SESSION['shift_closed_lock']);
    return json_encode([
      "authenticated" => false,
      "user" => null,
      "selectedTerminalId" => null,
      "shiftLocked" => true
    ]);
  }
  $user = currentUser();
  include "connection-pdo.php";
  if ($user) {
    $stmt = $conn->prepare(
      "SELECT u.user_id, u.username, u.first_name, u.last_name, u.assigned_terminal_id,
              t.terminal_name AS assigned_terminal_name,
              r.role_id, r.role_name
       FROM tblusers u
       INNER JOIN tblroles r ON r.role_id=u.role_id
       LEFT JOIN tblpos_terminals t ON t.pos_terminal_id = u.assigned_terminal_id
       WHERE u.user_id=:userId AND u.is_active=1"
    );
    $stmt->execute([":userId"=>$user['user_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    if ($user) {
      $user['role_name'] = normalizeRoleName($user['role_name']);
      $_SESSION['user'] = $user;
    } else {
      unset($_SESSION['user']);
    }
  }

  $selectedTerminalId = null;
  $selectedTerminalName = null;
  $detectedTerminal = detectClientTerminal($conn);

  if ($user) {
    if (strtolower(trim($user['role_name'])) === 'cashier') {
      // Cashier is strictly bound to their assigned terminal
      $assignedId = !empty($user['assigned_terminal_id']) ? (int)$user['assigned_terminal_id'] : null;
      $terminalIdToUse = !empty($_SESSION['pos_terminal_id']) ? (int)$_SESSION['pos_terminal_id'] : ($assignedId ?: ($detectedTerminal ? (int)$detectedTerminal['pos_terminal_id'] : null));
      if ($assignedId && $terminalIdToUse !== $assignedId) {
        $terminalIdToUse = $assignedId;
      }
      if ($terminalIdToUse) {
        $terminalStmt = $conn->prepare(
          "SELECT pos_terminal_id, terminal_name FROM tblpos_terminals WHERE pos_terminal_id=:terminalId"
        );
        $terminalStmt->execute([":terminalId"=>$terminalIdToUse]);
        $tRow = $terminalStmt->fetch(PDO::FETCH_ASSOC);
        if ($tRow) {
          $selectedTerminalId = (int)$tRow['pos_terminal_id'];
          $selectedTerminalName = $tRow['terminal_name'];
          $_SESSION['pos_terminal_id'] = $selectedTerminalId;
        }
      }
    } else {
      // Exempt roles (Supervisor, Admin, Manager, AR Staff) use the auto-detected terminal on the register
      $terminalIdToUse = !empty($_SESSION['pos_terminal_id'])
        ? (int)$_SESSION['pos_terminal_id']
        : ($detectedTerminal ? (int)$detectedTerminal['pos_terminal_id'] : null);
      if ($terminalIdToUse) {
        $terminalStmt = $conn->prepare(
          "SELECT pos_terminal_id, terminal_name FROM tblpos_terminals WHERE pos_terminal_id=:terminalId"
        );
        $terminalStmt->execute([":terminalId"=>$terminalIdToUse]);
        $tRow = $terminalStmt->fetch(PDO::FETCH_ASSOC);
        if ($tRow) {
          $selectedTerminalId = (int)$tRow['pos_terminal_id'];
          $selectedTerminalName = $tRow['terminal_name'];
          $_SESSION['pos_terminal_id'] = $selectedTerminalId;
        }
      }
    }
  } else {
    unset($_SESSION['pos_terminal_id']);
  }

  return json_encode([
    "authenticated" => (bool)$user,
    "user" => $user,
    "selectedTerminalId" => $selectedTerminalId === null ? null : (int)$selectedTerminalId,
    "selectedTerminalName" => $selectedTerminalName,
    "detectedTerminal" => $detectedTerminal
  ]);
}

function setUserPassword($json) {
  requireRoles(["Admin"]);
  include "connection-pdo.php";
  $data = json_decode($json, true);
  $password = $data['password'] ?? '';
  if (strlen($password) < 8) {
    http_response_code(422);
    return json_encode(["message" => "Password must be at least 8 characters."]);
  }
  $stmt = $conn->prepare("UPDATE tblusers SET password_hash=:passwordHash WHERE user_id=:userId");
  $stmt->execute([
    ":passwordHash" => password_hash($password, PASSWORD_DEFAULT),
    ":userId" => $data['userId']
  ]);
  return json_encode(["returnValue" => 1]);
}

function verifySupervisor($json) {
  include "connection-pdo.php";
  
  $data = [];
  if ($json) {
    $data = is_array($json) ? $json : (json_decode($json, true) ?: []);
  }
  if (empty($data)) {
    $rawInput = file_get_contents('php://input');
    if ($rawInput) {
      $data = json_decode($rawInput, true) ?: [];
    }
  }
  if (empty($data)) {
    $data = $_POST;
  }

  $username = trim($data['username'] ?? ($data['supervisor_username'] ?? ''));
  $password = $data['password'] ?? ($data['supervisor_password'] ?? ($data['pin'] ?? ''));
  $actionType = trim($data['action_type'] ?? ($data['actionType'] ?? 'unspecified_action'));
  $targetRef = trim($data['target_reference'] ?? ($data['targetReference'] ?? ''));
  $shiftId = !empty($data['shift_id']) ? (int)$data['shift_id'] : (!empty($data['shiftId']) ? (int)$data['shiftId'] : null);

  if (!$username || !$password) {
    http_response_code(422);
    return json_encode(["returnValue" => 0, "message" => "Supervisor username and password are required."]);
  }

  $stmt = $conn->prepare(
    "SELECT u.user_id, u.username, u.first_name, u.last_name, u.password_hash,
            COALESCE(u.role, '') AS role, r.role_id, r.role_name
     FROM tblusers u
     LEFT JOIN tblroles r ON u.role_id = r.role_id
     WHERE LOWER(u.username) = LOWER(:username) AND u.is_active = 1"
  );
  $stmt->execute([":username" => $username]);
  $supervisor = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$supervisor || !$supervisor['password_hash'] || !password_verify($password, $supervisor['password_hash'])) {
    http_response_code(401);
    return json_encode(["returnValue" => 0, "message" => "Invalid supervisor credentials."]);
  }

  $roleText = strtolower(trim($supervisor['role']));
  $roleName = strtolower(trim($supervisor['role_name'] ?? ''));
  $isAuthorized = ($roleText === 'supervisor' || $roleText === 'admin' || $roleText === 'manager'
                   || in_array($roleName, ['supervisor', 'admin', 'manager'], true));

  if (!$isAuthorized) {
    http_response_code(403);
    return json_encode(["returnValue" => 0, "message" => "User '{$supervisor['username']}' does not have supervisor authorization privileges."]);
  }

  $currentCashier = currentUser();
  $cashierId = $currentCashier ? (int)$currentCashier['user_id'] : null;

  if (!$shiftId && $cashierId) {
    try {
      $shiftStmt = $conn->prepare("SELECT shift_id FROM tblshifts WHERE user_id = :cid AND status = 'open' ORDER BY shift_id DESC LIMIT 1");
      $shiftStmt->execute([":cid" => $cashierId]);
      $activeShift = $shiftStmt->fetch(PDO::FETCH_ASSOC);
      if ($activeShift) {
        $shiftId = (int)$activeShift['shift_id'];
      }
    } catch (Exception $e) {
      // ignore
    }
  }

  try {
    $logStmt = $conn->prepare(
      "INSERT INTO tblauthorization_log (cashier_id, supervisor_id, action_type, target_reference, shift_id, created_at)
       VALUES (:cashierId, :supervisorId, :actionType, :targetRef, :shiftId, CURRENT_TIMESTAMP)"
    );
    $logStmt->execute([
      ":cashierId" => $cashierId,
      ":supervisorId" => $supervisor['user_id'],
      ":actionType" => $actionType,
      ":targetRef" => $targetRef ?: null,
      ":shiftId" => $shiftId
    ]);
    $logId = (int)$conn->lastInsertId();
  } catch (PDOException $e) {
    error_log("Failed to insert authorization log: " . $e->getMessage());
    $logId = null;
  }

  return json_encode([
    "returnValue" => 1,
    "authorized" => true,
    "log_id" => $logId,
    "auth_log_id" => $logId,
    "supervisor" => [
      "user_id" => (int)$supervisor['user_id'],
      "username" => $supervisor['username'],
      "name" => trim($supervisor['first_name'] . " " . $supervisor['last_name']),
      "role" => normalizeRoleName($supervisor['role'] ?: $supervisor['role_name'])
    ]
  ]);
}

$rawInput = file_get_contents('php://input');
$bodyJson = $rawInput ? json_decode($rawInput, true) : null;

$action = $_GET['action'] ?? ($_POST['action'] ?? ($bodyJson['action'] ?? ''));
$operation = $_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['operation'] ?? '') : ($_POST['operation'] ?? ($bodyJson['operation'] ?? ''));
$op = $action ?: $operation;
$json = $_SERVER['REQUEST_METHOD'] === 'GET' ? ($_GET['json'] ?? '') : ($_POST['json'] ?? ($bodyJson['json'] ?? $bodyJson ?? ''));

switch ($op) {
  case "login": echo login($json); break;
  case "logout": echo logout(); break;
  case "session": echo sessionInfo(); break;
  case "detectWorkstation": echo detectWorkstationInfo($json); break;
  case "setUserPassword": echo setUserPassword($json); break;
  case "verify_supervisor":
  case "verifySupervisor":
    echo verifySupervisor($json);
    break;
  default:
    http_response_code(400);
    echo json_encode(["message" => "Invalid authentication operation."]);
}
?>
