<?php
  require_once "auth-lib.php";
  header('Content-Type: application/json');
  header("Access-Control-Allow-Origin: *");

  class Role {

    function getAllRoles(){
      include "connection-pdo.php";
      $sql = "SELECT * FROM tblroles ORDER BY role_name";
      $stmt = $conn->prepare($sql);
      $stmt->execute();
      $rs = $stmt->fetchAll(PDO::FETCH_ASSOC);
      return json_encode($rs);
    }

    function getRole($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "SELECT * FROM tblroles WHERE role_id = :roleId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":roleId", $json['roleId']);
      $stmt->execute();
      $rs = $stmt->fetchAll(PDO::FETCH_ASSOC);
      return json_encode($rs);
    }

    function insertRole($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "INSERT INTO tblroles(role_name, description) VALUES(:roleName, :description)";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":roleName", $json['roleName']);
      $stmt->bindParam(":description", $json['description']);
      $stmt->execute();
      $returnValue = 0;
      if($stmt->rowCount() > 0){
        $returnValue = 1;
      }
      return json_encode($returnValue);
    }

    function updateRole($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "UPDATE tblroles SET role_name=:roleName, description=:description WHERE role_id=:roleId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":roleName", $json['roleName']);
      $stmt->bindParam(":description", $json['description']);
      $stmt->bindParam(":roleId", $json['roleId']);
      $stmt->execute();
      $returnValue = $stmt->rowCount() > 0 ? 1 : 0;
      return json_encode($returnValue);
    }

    function deleteRole($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);

      //a role that is still assigned to a user cannot be deleted
      $sqlCheck = "SELECT COUNT(*) FROM tblusers WHERE role_id = :roleId";
      $stmtCheck = $conn->prepare($sqlCheck);
      $stmtCheck->bindParam(":roleId", $json['roleId']);
      $stmtCheck->execute();
      if($stmtCheck->fetchColumn() > 0){
        return json_encode(["returnValue" => 0, "message" => "Cannot delete this role: it is still assigned to one or more users."]);
      }

      $sql = "DELETE FROM tblroles WHERE role_id=:roleId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":roleId", $json['roleId']);
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

  $role = new Role();
  if (in_array($operation, ["getAllRoles", "getRole"], true)) {
    requireRoles(["Admin", "Manager", "Supervisor"]);
  } else {
    requireRoles(["Admin"]);
  }
  switch($operation){
    case "getAllRoles":
      echo $role->getAllRoles();
      break;
    case "getRole":
      echo $role->getRole($json);
      break;
    case "insertRole":
      echo $role->insertRole($json);
      break;
    case "updateRole":
      echo $role->updateRole($json);
      break;
    case "deleteRole":
      echo $role->deleteRole($json);
      break;
  }
?>
