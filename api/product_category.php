<?php
  require_once "auth-lib.php";
  header('Content-Type: application/json');
  header("Access-Control-Allow-Origin: *");

  class ProductCategory {

    function getAllProductCategories(){
      include "connection-pdo.php";
      $sql = "SELECT * FROM tblproduct_categories ORDER BY category_name";
      $stmt = $conn->prepare($sql);
      $stmt->execute();
      $rs = $stmt->fetchAll(PDO::FETCH_ASSOC);
      return json_encode($rs);
    }

    function getProductCategory($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "SELECT * FROM tblproduct_categories WHERE category_id = :categoryId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":categoryId", $json['categoryId']);
      $stmt->execute();
      $rs = $stmt->fetchAll(PDO::FETCH_ASSOC);
      return json_encode($rs);
    }

    function insertProductCategory($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "INSERT INTO tblproduct_categories(category_name, description) VALUES(:categoryName, :description)";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":categoryName", $json['categoryName']);
      $stmt->bindParam(":description", $json['description']);
      $stmt->execute();
      $returnValue = 0;
      if($stmt->rowCount() > 0){
        $returnValue = 1;
      }
      return json_encode($returnValue);
    }

    function updateProductCategory($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);
      $sql = "UPDATE tblproduct_categories SET category_name=:categoryName, description=:description WHERE category_id=:categoryId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":categoryName", $json['categoryName']);
      $stmt->bindParam(":description", $json['description']);
      $stmt->bindParam(":categoryId", $json['categoryId']);
      $stmt->execute();
      $returnValue = $stmt->rowCount() > 0 ? 1 : 0;
      return json_encode($returnValue);
    }

    function deleteProductCategory($json){
      include "connection-pdo.php";
      $json = json_decode($json, true);

      //a category that still has products cannot be deleted
      $sqlCheck = "SELECT COUNT(*) FROM tblproducts WHERE category_id = :categoryId";
      $stmtCheck = $conn->prepare($sqlCheck);
      $stmtCheck->bindParam(":categoryId", $json['categoryId']);
      $stmtCheck->execute();
      if($stmtCheck->fetchColumn() > 0){
        return json_encode(["returnValue" => 0, "message" => "Cannot delete this category: it still has products assigned to it."]);
      }

      $sql = "DELETE FROM tblproduct_categories WHERE category_id=:categoryId";
      $stmt = $conn->prepare($sql);
      $stmt->bindParam(":categoryId", $json['categoryId']);
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

  $productCategory = new ProductCategory();
  if (in_array($operation, ["getAllProductCategories", "getProductCategory"], true)) {
    requireRoles(["Admin", "Manager", "Cashier", "Supervisor"]);
  } else {
    requireRoles(["Admin", "Manager", "Supervisor"]);
  }
  switch($operation){
    case "getAllProductCategories":
      echo $productCategory->getAllProductCategories();
      break;
    case "getProductCategory":
      echo $productCategory->getProductCategory($json);
      break;
    case "insertProductCategory":
      echo $productCategory->insertProductCategory($json);
      break;
    case "updateProductCategory":
      echo $productCategory->updateProductCategory($json);
      break;
    case "deleteProductCategory":
      echo $productCategory->deleteProductCategory($json);
      break;
  }
?>
