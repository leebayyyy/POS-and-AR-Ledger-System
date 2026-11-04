<?php
  require_once "auth-lib.php";
  header('Content-Type: application/json');
  header("Access-Control-Allow-Origin: *");

  class ArCustomer {

    function getAllCustomers(){
      include "connection-pdo.php";
      $sql = "SELECT a.*, b.type_name,
                     COALESCE(i.invoice_balance, 0) + COALESCE(s.pending_balance, 0) AS credit_exposure,
                     a.credit_limit - COALESCE(i.invoice_balance, 0) - COALESCE(s.pending_balance, 0) AS available_credit
              FROM tblar_customers a INNER JOIN tblar_customer_types b
              ON a.customer_type_id = b.customer_type_id
              LEFT JOIN (
                SELECT ar_customer_id, SUM(balance) AS invoice_balance
                FROM tblar_invoice WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0
                GROUP BY ar_customer_id
              ) i ON i.ar_customer_id = a.ar_customer_id
              LEFT JOIN (
                SELECT s.ar_customer_id, SUM(s.total_amount) AS pending_balance
                FROM tblsales s
                WHERE s.sale_type='AR' AND s.ar_customer_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM tblar_invoice ai WHERE ai.sale_id=s.sale_id)
                GROUP BY s.ar_customer_id
              ) s ON s.ar_customer_id = a.ar_customer_id
              ORDER BY a.customer_name";
      $stmt = $conn->prepare($sql);
      $stmt->execute();
      $rs = $stmt->fetchAll(PDO::FETCH_ASSOC);
      return json_encode($rs);
    }

    function getCustomer($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "SELECT a.*, b.type_name,
                     COALESCE(i.invoice_balance, 0) + COALESCE(s.pending_balance, 0) AS credit_exposure,
                     a.credit_limit - COALESCE(i.invoice_balance, 0) - COALESCE(s.pending_balance, 0) AS available_credit
              FROM tblar_customers a INNER JOIN tblar_customer_types b
              ON a.customer_type_id = b.customer_type_id
              LEFT JOIN (
                SELECT ar_customer_id, SUM(balance) AS invoice_balance
                FROM tblar_invoice WHERE status <> 'Pending' AND COALESCE(balance, 0) > 0
                GROUP BY ar_customer_id
              ) i ON i.ar_customer_id = a.ar_customer_id
              LEFT JOIN (
                SELECT s.ar_customer_id, SUM(s.total_amount) AS pending_balance
                FROM tblsales s
                WHERE s.sale_type='AR' AND s.ar_customer_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM tblar_invoice ai WHERE ai.sale_id=s.sale_id)
                GROUP BY s.ar_customer_id
              ) s ON s.ar_customer_id = a.ar_customer_id
              WHERE a.ar_customer_id = :arCustomerId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":arCustomerId", $json['arCustomerId']);
      $stmt->execute();
      $rs = $stmt->fetchAll(PDO::FETCH_ASSOC);
      return json_encode($rs);
    }

    function insertCustomer($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "INSERT INTO tblar_customers(customer_name, customer_type_id, contact_name, contact_phone, billing_address, email, is_active)
              VALUES(:customerName, :customerTypeId, :contactName, :contactPhone, :billingAddress, :email, 1)";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":customerName", $json['customerName']);
      $stmt->bindParam(":customerTypeId", $json['customerTypeId']);
      $stmt->bindParam(":contactName", $json['contactName']);
      $stmt->bindParam(":contactPhone", $json['contactPhone']);
      $stmt->bindParam(":billingAddress", $json['billingAddress']);
      $stmt->bindParam(":email", $json['email']);
      $stmt->execute();
      $returnValue = 0;
      if($stmt->rowCount() > 0){
        $returnValue = 1;
      }
      return json_encode($returnValue);
    }

    function updateCreditLimit($json){
      include "connection-pdo.php";
      $data = json_decode($json, true);
      if (!is_array($data)) {
        http_response_code(422);
        return json_encode(["message" => "A customer ID and credit limit are required."]);
      }
      $limit = isset($data['creditLimit']) ? (string)$data['creditLimit'] : '';
      if (!isset($data['arCustomerId']) || !ctype_digit((string)$data['arCustomerId'])
          || (int)$data['arCustomerId'] < 1
          || !preg_match('/^\d{1,10}(?:\.\d{1,2})?$/', $limit)
          || (float)$limit > 9999999999.99) {
        http_response_code(422);
        return json_encode(["message" => "Enter a valid non-negative credit limit with up to two decimal places."]);
      }
      $stmt = $conn->prepare("UPDATE tblar_customers SET credit_limit=:creditLimit WHERE ar_customer_id=:arCustomerId");
      $stmt->execute([":creditLimit"=>$limit, ":arCustomerId"=>(int)$data['arCustomerId']]);
      if ($stmt->rowCount() === 0) {
        $check = $conn->prepare("SELECT 1 FROM tblar_customers WHERE ar_customer_id=:arCustomerId");
        $check->execute([":arCustomerId"=>(int)$data['arCustomerId']]);
        if (!$check->fetchColumn()) return json_encode(0);
      }
      return json_encode(1);
    }

    function updateCustomer($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "UPDATE tblar_customers SET customer_name=:customerName, customer_type_id=:customerTypeId,
                contact_name=:contactName, contact_phone=:contactPhone, billing_address=:billingAddress, email=:email
              WHERE ar_customer_id=:arCustomerId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":customerName", $json['customerName']);
      $stmt->bindParam(":customerTypeId", $json['customerTypeId']);
      $stmt->bindParam(":contactName", $json['contactName']);
      $stmt->bindParam(":contactPhone", $json['contactPhone']);
      $stmt->bindParam(":billingAddress", $json['billingAddress']);
      $stmt->bindParam(":email", $json['email']);
      $stmt->bindParam(":arCustomerId", $json['arCustomerId']);
      $stmt->execute();
      $returnValue = $stmt->rowCount() > 0 ? 1 : 0;
      return json_encode($returnValue);
    }

    //soft delete - customers are referenced by AR invoice / sales history
    function deactivateCustomer($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "UPDATE tblar_customers SET is_active=0 WHERE ar_customer_id=:arCustomerId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":arCustomerId", $json['arCustomerId']);
      $stmt->execute();
      $returnValue = $stmt->rowCount() > 0 ? 1 : 0;
      return json_encode($returnValue);
    }

    function restoreCustomer($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "UPDATE tblar_customers SET is_active=1 WHERE ar_customer_id=:arCustomerId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":arCustomerId", $json['arCustomerId']);
      $stmt->execute();
      $returnValue = $stmt->rowCount() > 0 ? 1 : 0;
      return json_encode($returnValue);
    }
  }

  //submitted by the client - operation and json
  if ($_SERVER['REQUEST_METHOD'] == 'GET'){
    $operation = $_GET['operation'];
    $json = isset($_GET['json']) ? $_GET['json'] : "";
  }else if($_SERVER['REQUEST_METHOD'] == 'POST'){
    $operation = $_POST['operation'];
    $json = isset($_POST['json']) ? $_POST['json'] : "";
  }

  $customer = new ArCustomer();
  if ($operation === "updateCreditLimit") {
    requireRoles(["Admin", "Accounts Receivable Staff", "Manager", "Supervisor"]);
  } else if (in_array($operation, ["insertCustomer", "updateCustomer", "deactivateCustomer", "restoreCustomer"], true)) {
    requireRoles(["Admin", "Manager", "Supervisor"]);
  } else {
    requireRoles(["Admin", "Accounts Receivable Staff", "Manager", "Supervisor"]);
  }
  switch($operation){
    case "getAllCustomers":
      echo $customer->getAllCustomers();
      break;
    case "getCustomer":
      echo $customer->getCustomer($json);
      break;
    case "insertCustomer":
      echo $customer->insertCustomer($json);
      break;
    case "updateCustomer":
      echo $customer->updateCustomer($json);
      break;
    case "updateCreditLimit":
      echo $customer->updateCreditLimit($json);
      break;
    case "deactivateCustomer":
      echo $customer->deactivateCustomer($json);
      break;
    case "restoreCustomer":
      echo $customer->restoreCustomer($json);
      break;
  }
?>
