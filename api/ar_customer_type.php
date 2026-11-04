<?php
  require_once "auth-lib.php";
  header('Content-Type: application/json');
  header("Access-Control-Allow-Origin: *");

  class ArCustomerType {

    function getAllCustomerTypes(){
      include "connection-pdo.php";
      $sql = "SELECT customer_type_id, type_name, description, days
              FROM tblar_customer_types
              ORDER BY type_name";
      $stmt = $conn->prepare($sql);
      $stmt->execute();
      $rs = $stmt->fetchAll(PDO::FETCH_ASSOC);
      return json_encode($rs);
    }

    function getCustomerType($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "SELECT customer_type_id, type_name, description, days
              FROM tblar_customer_types
              WHERE customer_type_id = :customerTypeId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":customerTypeId", $json['customerTypeId']);
      $stmt->execute();
      $rs = $stmt->fetchAll(PDO::FETCH_ASSOC);
      return json_encode($rs);
    }

    function insertCustomerType($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "INSERT INTO tblar_customer_types(type_name, description, days)
              VALUES(:typeName, :description, :days)";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":typeName", $json['typeName']);
      $stmt->bindParam(":description", $json['description']);
      $days = ($json['days'] ?? '') === '' ? null : (int)$json['days'];
      $stmt->bindValue(":days", $days, $days === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
      $stmt->execute();
      $returnValue = 0;
      if($stmt->rowCount() > 0){
        $returnValue = 1;
      }
      return json_encode($returnValue);
    }

    function updateCustomerType($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "UPDATE tblar_customer_types
              SET type_name=:typeName, description=:description, days=:days
              WHERE customer_type_id=:customerTypeId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":typeName", $json['typeName']);
      $stmt->bindParam(":description", $json['description']);
      $days = ($json['days'] ?? '') === '' ? null : (int)$json['days'];
      $stmt->bindValue(":days", $days, $days === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
      $stmt->bindParam(":customerTypeId", $json['customerTypeId']);
      $stmt->execute();
      $returnValue = 1;
      return json_encode($returnValue);
    }

    function deleteCustomerType($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);

      //a type still assigned to an AR customer cannot be deleted
      $sqlCheck = "SELECT COUNT(*) FROM tblar_customers WHERE customer_type_id = :customerTypeId";
      $stmtCheck = $conn->prepare($sqlCheck);
      $stmtCheck->bindParam(":customerTypeId", $json['customerTypeId']);
      $stmtCheck->execute();
      if($stmtCheck->fetchColumn() > 0){
        return json_encode(["returnValue" => 0, "message" => "Cannot delete this type: it still has AR customers assigned to it."]);
      }

      $sql = "DELETE FROM tblar_customer_types WHERE customer_type_id=:customerTypeId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":customerTypeId", $json['customerTypeId']);
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

  $customerType = new ArCustomerType();
  if (in_array($operation, ["insertCustomerType", "updateCustomerType", "deleteCustomerType"], true)) {
    requireRoles(["Admin", "Manager", "Supervisor"]);
  } else {
    requireRoles(["Admin", "Accounts Receivable Staff", "Manager", "Supervisor"]);
  }
  switch($operation){
    case "getAllCustomerTypes":
      echo $customerType->getAllCustomerTypes();
      break;
    case "getCustomerType":
      echo $customerType->getCustomerType($json);
      break;
    case "insertCustomerType":
      echo $customerType->insertCustomerType($json);
      break;
    case "updateCustomerType":
      echo $customerType->updateCustomerType($json);
      break;
    case "deleteCustomerType":
      echo $customerType->deleteCustomerType($json);
      break;
  }
?>
