<?php
session_start();

function currentUser() {
  return $_SESSION['user'] ?? null;
}

function normalizeRoleName($roleName) {
  $normalized = strtolower(str_replace('_', ' ', trim((string)$roleName)));
  $knownRoles = [
    'admin' => 'Admin',
    'cashier' => 'Cashier',
    'manager' => 'Manager',
    'supervisor' => 'Supervisor',
    'accounts receivable staff' => 'Accounts Receivable Staff',
    'ar staff' => 'Accounts Receivable Staff'
  ];
  return $knownRoles[$normalized] ?? trim((string)$roleName);
}

/**
 * WP-2: Server-side POS Terminal Registry & Auto-Detection Engine
 * Maps client workstation identifier (device_token, machine_identifier, hostname/IP,
 * or documented localhost simulation parameter) -> tblpos_terminals row.
 */
function detectClientTerminal($conn, $requestData = []) {
  if (!is_array($requestData)) {
    $requestData = [];
  }

  // 1. Collect candidate tokens / identifiers in priority order:
  //    Explicit request payload -> URL query params -> HTTP headers -> Workstation cookies
  $candidates = [];

  $payloadKeys = ['simulatedTerminalId', 'terminalId', 'terminal', 'deviceToken', 'device_token', 'machineIdentifier', 'machine_identifier', 'workstation'];
  foreach ($payloadKeys as $key) {
    if (isset($requestData[$key]) && trim((string)$requestData[$key]) !== '') {
      $candidates[] = trim((string)$requestData[$key]);
    }
  }

  $queryKeys = ['terminal', 'workstation', 'device_token', 'machine_identifier'];
  foreach ($queryKeys as $key) {
    if (isset($_GET[$key]) && trim((string)$_GET[$key]) !== '') {
      $candidates[] = trim((string)$_GET[$key]);
    }
  }

  $headerKeys = ['HTTP_X_POS_TERMINAL', 'HTTP_X_POS_DEVICE_TOKEN', 'HTTP_X_POS_MACHINE_ID'];
  foreach ($headerKeys as $key) {
    if (!empty($_SERVER[$key]) && trim((string)$_SERVER[$key]) !== '') {
      $candidates[] = trim((string)$_SERVER[$key]);
    }
  }

  $cookieKeys = ['pos_simulated_terminal', 'pos_device_token', 'pos_machine_identifier'];
  foreach ($cookieKeys as $key) {
    if (!empty($_COOKIE[$key]) && trim((string)$_COOKIE[$key]) !== '') {
      $candidates[] = trim((string)$_COOKIE[$key]);
    }
  }

  try {
    foreach ($candidates as $candidate) {
      if (ctype_digit($candidate) && (int)$candidate > 0) {
        $stmt = $conn->prepare(
          "SELECT pos_terminal_id, terminal_name, machine_identifier, device_token, ip_address, COALESCE(is_active, 1) AS is_active
           FROM tblpos_terminals
           WHERE pos_terminal_id = :tid AND COALESCE(is_active, 1) = 1
           LIMIT 1"
        );
        $stmt->execute([":tid" => (int)$candidate]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
          $row['detection_source'] = 'workstation_token';
          return $row;
        }
      }

      $stmt = $conn->prepare(
        "SELECT pos_terminal_id, terminal_name, machine_identifier, device_token, ip_address, COALESCE(is_active, 1) AS is_active
         FROM tblpos_terminals
         WHERE (LOWER(COALESCE(device_token, '')) = LOWER(:val)
            OR LOWER(COALESCE(machine_identifier, '')) = LOWER(:val)
            OR LOWER(terminal_name) = LOWER(:val))
           AND COALESCE(is_active, 1) = 1
         ORDER BY pos_terminal_id ASC
         LIMIT 1"
      );
      $stmt->execute([":val" => $candidate]);
      $row = $stmt->fetch(PDO::FETCH_ASSOC);
      if ($row) {
        $row['detection_source'] = 'registry_token';
        return $row;
      }
    }

    // 2. Match by non-loopback client IP address or reverse-DNS machine hostname
    $remoteIp = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    $isLoopback = in_array($remoteIp, ['127.0.0.1', '::1', 'localhost', ''], true);

    if (!$isLoopback) {
      $stmt = $conn->prepare(
        "SELECT pos_terminal_id, terminal_name, machine_identifier, device_token, ip_address, COALESCE(is_active, 1) AS is_active
         FROM tblpos_terminals
         WHERE ip_address = :ip AND COALESCE(is_active, 1) = 1
         ORDER BY pos_terminal_id ASC
         LIMIT 1"
      );
      $stmt->execute([":ip" => $remoteIp]);
      $row = $stmt->fetch(PDO::FETCH_ASSOC);
      if ($row) {
        $row['detection_source'] = 'ip_address';
        return $row;
      }

      $hostName = @gethostbyaddr($remoteIp);
      if ($hostName && $hostName !== $remoteIp) {
        $stmt = $conn->prepare(
          "SELECT pos_terminal_id, terminal_name, machine_identifier, device_token, ip_address, COALESCE(is_active, 1) AS is_active
           FROM tblpos_terminals
           WHERE LOWER(COALESCE(machine_identifier, '')) = LOWER(:host) AND COALESCE(is_active, 1) = 1
           ORDER BY pos_terminal_id ASC
           LIMIT 1"
        );
        $stmt->execute([":host" => $hostName]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
          $row['detection_source'] = 'hostname';
          return $row;
        }
      }
    }

    // 3. Localhost default fallback: check tblsystem_settings ('default_localhost_terminal_id'), then IP 127.0.0.1, then first active terminal
    try {
      $setStmt = $conn->prepare("SELECT setting_value FROM tblsystem_settings WHERE setting_key = 'default_localhost_terminal_id'");
      $setStmt->execute();
      $defaultTid = (int)$setStmt->fetchColumn();
      if ($defaultTid > 0) {
        $stmt = $conn->prepare(
          "SELECT pos_terminal_id, terminal_name, machine_identifier, device_token, ip_address, COALESCE(is_active, 1) AS is_active
           FROM tblpos_terminals
           WHERE pos_terminal_id = :tid AND COALESCE(is_active, 1) = 1
           LIMIT 1"
        );
        $stmt->execute([":tid" => $defaultTid]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
          $row['detection_source'] = 'localhost_default_setting';
          return $row;
        }
      }
    } catch (Throwable $e) {
      // Ignore if settings table is not yet present
    }

    $fallbackStmt = $conn->query(
      "SELECT pos_terminal_id, terminal_name, machine_identifier, device_token, ip_address, COALESCE(is_active, 1) AS is_active
       FROM tblpos_terminals
       WHERE COALESCE(is_active, 1) = 1
       ORDER BY pos_terminal_id ASC
       LIMIT 1"
    );
    $fallbackRow = $fallbackStmt ? $fallbackStmt->fetch(PDO::FETCH_ASSOC) : null;
    if ($fallbackRow) {
      $fallbackRow['detection_source'] = 'first_active_terminal';
      return $fallbackRow;
    }
  } catch (Throwable $e) {
    // Fallback if migration columns are not yet present
    try {
      $basicStmt = $conn->query("SELECT pos_terminal_id, terminal_name FROM tblpos_terminals ORDER BY pos_terminal_id ASC LIMIT 1");
      $basicRow = $basicStmt ? $basicStmt->fetch(PDO::FETCH_ASSOC) : null;
      if ($basicRow) {
        $basicRow['detection_source'] = 'legacy_fallback';
        return $basicRow;
      }
    } catch (Throwable $inner) {
      // Ignore
    }
  }

  return null;
}

function requireLogin() {
  $user = currentUser();
  if (!$user) {
    http_response_code(401);
    echo json_encode(["message" => "Login required."]);
    exit;
  }
  return $user;
}

function requireRoles($roles) {
  $user = requireLogin();
  include "connection-pdo.php";
  $stmt = $conn->prepare(
    "SELECT u.user_id, u.username, u.first_name, u.last_name, u.assigned_terminal_id,
            r.role_id, r.role_name
     FROM tblusers u
     INNER JOIN tblroles r ON r.role_id=u.role_id
     WHERE u.user_id=:userId AND u.is_active=1"
  );
  $stmt->execute([":userId"=>$user['user_id']]);
  $currentUser = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$currentUser) {
    unset($_SESSION['user']);
    http_response_code(401);
    echo json_encode(["message" => "Your account is inactive or unavailable. Please log in again."]);
    exit;
  }
  $currentUser['role_name'] = normalizeRoleName($currentUser['role_name']);
  $_SESSION['user'] = $currentUser;
  $user = $currentUser;
  header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
  header("Pragma: no-cache");
  header("Expires: Sat, 01 Jan 2000 00:00:00 GMT");

  $userRole = strtolower(trim($user['role_name']));
  $allowedRoles = array_map(function($r) { return strtolower(trim($r)); }, (array)$roles);
  if (!in_array($userRole, $allowedRoles, true)) {
    http_response_code(403);
    echo json_encode(["message" => "You are not authorized to perform this action."]);
    exit;
  }
  return $user;
}
