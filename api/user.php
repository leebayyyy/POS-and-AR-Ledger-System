<?php
  header('Content-Type: application/json');
  header("Access-Control-Allow-Origin: *");
  require_once "auth-lib.php";

  class User {

    private function decodeUserData($json) {
      $data = json_decode($json, true);
      if (!is_array($data)) {
        http_response_code(422);
        echo json_encode(["message" => "A valid user record is required."]);
        exit;
      }
      return $data;
    }

    private function validEmployeeRole($roleId, $allowExistingAdminRole = false) {
      include "connection-pdo.php";
      $roleId = filter_var($roleId, FILTER_VALIDATE_INT);
      if (!$roleId || $roleId < 1) {
        return false;
      }
      $roleConstraint = $allowExistingAdminRole
        ? "AND role_name IN ('Cashier', 'Accounts Receivable Staff', 'Manager', 'Admin', 'Supervisor')"
        : "AND role_name IN ('Cashier', 'Accounts Receivable Staff', 'Manager', 'Supervisor')";
      $stmt = $conn->prepare("SELECT role_name FROM tblroles WHERE role_id=:roleId {$roleConstraint}");
      $stmt->execute([":roleId"=>$roleId]);
      $roleName = $stmt->fetchColumn();
      return $roleName !== false && ($roleName !== 'Admin' || $allowExistingAdminRole);
    }

    private function validEmployeeFields($data, $includePassword, $existingRoleId = null) {
      $requiredFields = ["username", "firstName", "lastName", "roleId"];
      foreach ($requiredFields as $field) {
        if (!isset($data[$field])) {
          http_response_code(422);
          echo json_encode(["message" => "Username, first name, last name, and an employee role are required."]);
          return false;
        }
        if ($field === "roleId") {
          if ((!is_string($data[$field]) && !is_int($data[$field])) ||
              !preg_match('/^[1-9]\d*$/', (string)$data[$field])) {
            http_response_code(422);
            echo json_encode(["message" => "Choose Cashier, Accounts Receivable Staff, Supervisor, or Manager."]);
            return false;
          }
        } elseif (!is_string($data[$field]) || trim($data[$field]) === "") {
          http_response_code(422);
          echo json_encode(["message" => "Username, first name, last name, and an employee role are required."]);
          return false;
        }
      }
      $limits = ["username"=>50, "firstName"=>50, "lastName"=>50, "email"=>100, "phone"=>30];
      foreach ($limits as $field=>$limit) {
        $length = isset($data[$field]) && is_string($data[$field])
          ? preg_match_all('/./us', $data[$field], $characters)
          : 0;
        if (isset($data[$field]) && (!is_string($data[$field]) || $length === false || $length > $limit)) {
          http_response_code(422);
          echo json_encode(["message" => ucfirst($field) . " must be no longer than {$limit} characters."]);
          return false;
        }
      }
      foreach (["email", "phone"] as $field) {
        if (isset($data[$field]) && !is_string($data[$field])) {
          http_response_code(422);
          echo json_encode(["message" => ucfirst($field) . " must be text."]);
          return false;
        }
      }
      if (!empty($data['email']) && !filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        http_response_code(422);
        echo json_encode(["message" => "Enter a valid email address."]);
        return false;
      }
      if ($includePassword && (!isset($data['password']) || !is_string($data['password']) || strlen($data['password']) < 8)) {
        http_response_code(422);
        echo json_encode(["message" => "Password must be at least 8 characters."]);
        return false;
      }
      if (!$includePassword && isset($data['password']) && $data['password'] !== '' &&
          (!is_string($data['password']) || strlen($data['password']) < 8)) {
        http_response_code(422);
        echo json_encode(["message" => "A new password must be at least 8 characters."]);
        return false;
      }
      $allowExistingAdminRole = $existingRoleId !== null &&
        (int)$existingRoleId === (int)$data['roleId'];
      if (!$this->validEmployeeRole($data['roleId'], $allowExistingAdminRole)) {
        http_response_code(422);
        echo json_encode(["message" => "Choose Cashier, Accounts Receivable Staff, Supervisor, or Manager."]);
        return false;
      }
      return true;
    }

    function getAllUsers(){
      include "connection-pdo.php";
      $sql = "SELECT a.user_id, a.username, a.first_name, a.last_name, a.role_id, a.email, a.phone, a.is_active,
                     a.assigned_terminal_id, t.terminal_name AS assigned_terminal_name,
                     b.role_name
              FROM tblusers a
              INNER JOIN tblroles b ON a.role_id = b.role_id
              LEFT JOIN tblpos_terminals t ON t.pos_terminal_id = a.assigned_terminal_id
              ORDER BY a.last_name, a.first_name";
      $stmt = $conn->prepare($sql);
      $stmt->execute();
      $rs = $stmt->fetchAll(PDO::FETCH_ASSOC);
      return json_encode($rs);
    }

    function getUser($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "SELECT a.user_id, a.username, a.first_name, a.last_name, a.role_id, a.email, a.phone, a.is_active,
                     a.assigned_terminal_id, t.terminal_name AS assigned_terminal_name,
                     b.role_name
              FROM tblusers a
              INNER JOIN tblroles b ON a.role_id = b.role_id
              LEFT JOIN tblpos_terminals t ON t.pos_terminal_id = a.assigned_terminal_id
              WHERE a.user_id = :userId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":userId", $json['userId']);
      $stmt->execute();
      $rs = $stmt->fetchAll(PDO::FETCH_ASSOC);
      return json_encode($rs);
    }

    function insertUser($json){
      include "connection-pdo.php";
      $json = $this->decodeUserData($json);
      if (!$this->validEmployeeFields($json, true)) {
        return "";
      }
      $checkStmt = $conn->prepare("SELECT 1 FROM tblusers WHERE LOWER(username) = LOWER(:username)");
      $checkStmt->execute([":username" => $json['username']]);
      if ($checkStmt->fetchColumn()) {
        http_response_code(422);
        echo json_encode(["message" => "Username is already taken."]);
        return "";
      }
      if (!empty($json['email'])) {
        $checkEmail = $conn->prepare("SELECT 1 FROM tblusers WHERE LOWER(email) = LOWER(:email)");
        $checkEmail->execute([":email" => $json['email']]);
        if ($checkEmail->fetchColumn()) {
          http_response_code(422);
          echo json_encode(["message" => "Email address is already in use."]);
          return "";
        }
      }
      $assignedTerminalId = !empty($json['assignedTerminalId']) ? filter_var($json['assignedTerminalId'], FILTER_VALIDATE_INT) : null;
      if (!$assignedTerminalId) $assignedTerminalId = null;

      $sql = "INSERT INTO tblusers(username, first_name, last_name, role_id, email, phone, password_hash, assigned_terminal_id, is_active)
              VALUES(:username, :firstName, :lastName, :roleId, :email, :phone, :passwordHash, :assignedTerminalId, 1)";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":username", $json['username']);
      $stmt->bindParam(":firstName", $json['firstName']);
      $stmt->bindParam(":lastName", $json['lastName']);
      $stmt->bindParam(":roleId", $json['roleId']);
      $email = $json['email'] ?? null;
      $phone = $json['phone'] ?? null;
      $stmt->bindParam(":email", $email);
      $stmt->bindParam(":phone", $phone);
      $passwordHash = password_hash($json['password'], PASSWORD_DEFAULT);
      $stmt->bindParam(":passwordHash", $passwordHash);
      $stmt->bindValue(":assignedTerminalId", $assignedTerminalId, $assignedTerminalId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
      $stmt->execute();
      $returnValue = 0;
      if($stmt->rowCount() > 0){
        $returnValue = 1;
      }
      return json_encode($returnValue);
    }

    function updateUser($json){
      include "connection-pdo.php";
      $json = $this->decodeUserData($json);
      $currentUser = currentUser();
      $userId = filter_var($json['userId'] ?? null, FILTER_VALIDATE_INT);
      if (!$userId || $userId < 1) {
        http_response_code(422);
        return json_encode(["message" => "A valid employee account is required."]);
      }
      $currentRoleStmt = $conn->prepare("SELECT role_id FROM tblusers WHERE user_id=:userId");
      $currentRoleStmt->execute([":userId"=>$userId]);
      $currentRoleId = $currentRoleStmt->fetchColumn();
      if ($currentRoleId === false) {
        http_response_code(404);
        return json_encode(["message" => "Employee account not found."]);
      }
      if (!$this->validEmployeeFields($json, false, $currentRoleId)) {
        return "";
      }
      $checkStmt = $conn->prepare("SELECT 1 FROM tblusers WHERE LOWER(username) = LOWER(:username) AND user_id <> :userId");
      $checkStmt->execute([":username" => $json['username'], ":userId" => $userId]);
      if ($checkStmt->fetchColumn()) {
        http_response_code(422);
        echo json_encode(["message" => "Username is already taken."]);
        return "";
      }
      if (!empty($json['email'])) {
        $checkEmail = $conn->prepare("SELECT 1 FROM tblusers WHERE LOWER(email) = LOWER(:email) AND user_id <> :userId");
        $checkEmail->execute([":email" => $json['email'], ":userId" => $userId]);
        if ($checkEmail->fetchColumn()) {
          http_response_code(422);
          echo json_encode(["message" => "Email address is already in use."]);
          return "";
        }
      }
      $roleId = filter_var($json['roleId'], FILTER_VALIDATE_INT);
      if ((int)$currentUser['user_id'] === $userId && (int)$currentRoleId !== $roleId) {
        http_response_code(403);
        return json_encode(["message" => "You cannot change your own role assignment."]);
      }
      $assignedTerminalId = !empty($json['assignedTerminalId']) ? filter_var($json['assignedTerminalId'], FILTER_VALIDATE_INT) : null;
      if (!$assignedTerminalId) $assignedTerminalId = null;

      $passwordClause = empty($json['password']) ? "" : ", password_hash=:passwordHash";
      $sql = "UPDATE tblusers SET username=:username, first_name=:firstName, last_name=:lastName,
                role_id=:roleId, email=:email, phone=:phone, assigned_terminal_id=:assignedTerminalId" . $passwordClause . "
              WHERE user_id=:userId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":username", $json['username']);
      $stmt->bindParam(":firstName", $json['firstName']);
      $stmt->bindParam(":lastName", $json['lastName']);
      $stmt->bindParam(":roleId", $roleId);
      $email = $json['email'] ?? null;
      $phone = $json['phone'] ?? null;
      $stmt->bindParam(":email", $email);
      $stmt->bindParam(":phone", $phone);
      $stmt->bindValue(":assignedTerminalId", $assignedTerminalId, $assignedTerminalId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
      if (!empty($json['password'])) {
        $passwordHash = password_hash($json['password'], PASSWORD_DEFAULT);
        $stmt->bindParam(":passwordHash", $passwordHash);
      }
      $stmt->bindParam(":userId", $json['userId']);
      $stmt->execute();
      $returnValue = 1;
      return json_encode($returnValue);
    }

    function deactivateUser($json){
      include "connection-pdo.php";
      $json = $this->decodeUserData($json);
      $userId = filter_var($json['userId'] ?? null, FILTER_VALIDATE_INT);
      if (!$userId || $userId < 1) {
        http_response_code(422);
        return json_encode(["message" => "A valid employee account is required."]);
      }
      if ((int)currentUser()['user_id'] === $userId) {
        http_response_code(403);
        return json_encode(["message" => "You cannot deactivate your own account."]);
      }
      $sql = "UPDATE tblusers SET is_active=0 WHERE user_id=:userId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":userId", $userId);
      $stmt->execute();
      $returnValue = $stmt->rowCount() > 0 ? 1 : 0;
      return json_encode($returnValue);
    }

    function restoreUser($json){
      include "connection-pdo.php";
      $json = $this->decodeUserData($json);
      $userId = filter_var($json['userId'] ?? null, FILTER_VALIDATE_INT);
      if (!$userId || $userId < 1) {
        http_response_code(422);
        return json_encode(["message" => "A valid employee account is required."]);
      }
      $sql = "UPDATE tblusers SET is_active=1 WHERE user_id=:userId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":userId", $userId);
      $stmt->execute();
      $returnValue = $stmt->rowCount() > 0 ? 1 : 0;
      return json_encode($returnValue);
    }
  }

  if ($_SERVER['REQUEST_METHOD'] == 'GET'){
    $operation = $_GET['operation'];
    $json = isset($_GET['json']) ? $_GET['json'] : "";
  }else if($_SERVER['REQUEST_METHOD'] == 'POST'){
    $operation = $_POST['operation'];
    $json = isset($_POST['json']) ? $_POST['json'] : "";
  }

  $user = new User();
  if (in_array($operation, ["getAllUsers", "getUser"], true)) {
    requireRoles(["Admin", "Manager", "Supervisor"]);
  } else {
    requireRoles(["Admin"]);
  }
  switch($operation){
    case "getAllUsers":
      echo $user->getAllUsers();
      break;
    case "getUser":
      echo $user->getUser($json);
      break;
    case "insertUser":
      echo $user->insertUser($json);
      break;
    case "updateUser":
      echo $user->updateUser($json);
      break;
    case "deactivateUser":
      echo $user->deactivateUser($json);
      break;
    case "restoreUser":
      echo $user->restoreUser($json);
      break;
  }
?>
