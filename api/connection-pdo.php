<?php
date_default_timezone_set('Asia/Manila');

// Supports both PostgreSQL (DATABASE_URL or db_driver = 'pgsql') and local XAMPP MariaDB/MySQL.
$localConfig = [];
$localConfigFile = __DIR__ . '/config.local.php';
if (file_exists($localConfigFile)) {
  $loaded = include $localConfigFile;
  if (is_array($loaded)) {
    $localConfig = $loaded;
  }
}

$databaseUrl = getenv('DATABASE_URL') ?: ($_ENV['DATABASE_URL'] ?? ($localConfig['database_url'] ?? ''));
if (!empty($databaseUrl)) {
  $parsed = parse_url($databaseUrl);
  $dbDriver = 'pgsql';
  $dbHost = $parsed['host'] ?? 'localhost';
  $dbPort = $parsed['port'] ?? 5432;
  $dbName = ltrim($parsed['path'] ?? '/pos_ar_system', '/');
  $dbUser = isset($parsed['user']) ? urldecode($parsed['user']) : 'postgres';
  $dbPass = isset($parsed['pass']) ? urldecode($parsed['pass']) : '';
} else {
  $dbDriver = strtolower(trim($localConfig['db_driver'] ?? (getenv('DB_DRIVER') ?: 'mysql')));
  $dbHost = $localConfig['db_host'] ?? (getenv('DB_HOST') ?: 'localhost');
  $dbPort = $localConfig['db_port'] ?? (getenv('DB_PORT') ?: ($dbDriver === 'pgsql' ? 5432 : 3306));
  $dbName = $localConfig['db_name'] ?? (getenv('DB_NAME') ?: 'pos_ar_system');
  $dbUser = $localConfig['db_user'] ?? (getenv('DB_USER') ?: ($dbDriver === 'pgsql' ? 'postgres' : 'root'));
  $dbPass = $localConfig['db_pass'] ?? (getenv('DB_PASS') !== false ? getenv('DB_PASS') : '');
}

$dsn = $dbDriver === 'pgsql'
  ? "pgsql:host={$dbHost};port={$dbPort};dbname={$dbName}"
  : "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4";

try {
  $conn = new PDO($dsn, $dbUser, $dbPass);
  $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  if ($dbDriver === 'pgsql') {
    $conn->exec("SET TIME ZONE 'Asia/Manila'");
  } else {
    $conn->exec("SET time_zone = '+08:00'");
  }
} catch (PDOException $e) {
  error_log("Database connection failed: " . $e->getMessage());
  http_response_code(500);
  die(json_encode(["error" => "Database connection failed", "details" => $e->getMessage()]));
}
?>
