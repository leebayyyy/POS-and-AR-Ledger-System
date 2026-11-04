-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 30, 2026 at 03:18 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `pos_ar_system`
--

-- --------------------------------------------------------

--
-- Table structure for table `tblar_credit_memo`
--

CREATE TABLE `tblar_credit_memo` (
  `credit_memo_id` int(11) NOT NULL,
  `ar_invoice_id` int(11) NOT NULL,
  `issue_date` date DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `invoice_balance` decimal(10,2) DEFAULT NULL,
  `issued_by_user_id` int(11) NOT NULL,
  `status` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblar_credit_memo`
--

INSERT INTO `tblar_credit_memo` (`credit_memo_id`, `ar_invoice_id`, `issue_date`, `amount`, `invoice_balance`, `issued_by_user_id`, `status`) VALUES
(1, 1, '2026-09-20', 5.00, 45.00, 3, 'Approved'),
(2, 2, '2026-09-20', 90.00, 0.00, 3, 'Approved'),
(3, 1, '2026-09-20', 200.00, 50.00, 3, 'Approved'),
(4, 3, '2026-09-20', 600.00, 375.00, 3, 'Approved');

-- --------------------------------------------------------

--
-- Table structure for table `tblar_customers`
--

CREATE TABLE `tblar_customers` (
  `ar_customer_id` int(11) NOT NULL,
  `customer_name` varchar(200) NOT NULL,
  `customer_type_id` int(11) NOT NULL,
  `contact_name` varchar(150) DEFAULT NULL,
  `contact_phone` varchar(30) DEFAULT NULL,
  `billing_address` varchar(255) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `credit_limit` decimal(12,2) NOT NULL DEFAULT 0.00,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblar_customers`
--

INSERT INTO `tblar_customers` (`ar_customer_id`, `customer_name`, `customer_type_id`, `contact_name`, `contact_phone`, `billing_address`, `email`, `credit_limit`, `is_active`) VALUES
(1, 'Juan Dela Cruz Store', 2, 'Juan Dela Cruz', '09171234567', 'Carmen, Cagayan de Oro City', NULL, 1000.00, 1),
(2, 'Maria Sari-Sari Store', 1, 'Maria Santos', '09181234567', 'Lapasan, Cagayan de Oro City', NULL, 800.00, 1),
(3, 'Pedro Grocery', 2, 'Pedro Reyes', '09191234567', 'Bulua, Cagayan de Oro City', NULL, 10000.00, 1),
(4, 'Elaine KOMETA', 1, 'Elaine Colita', '09631324606', 'Zone 3 Upper Palalan Lumbia, Cagayan De Oro City', 'elaine@gmail.com', 500.00, 1);

-- --------------------------------------------------------

--
-- Table structure for table `tblar_customer_types`
--

CREATE TABLE `tblar_customer_types` (
  `customer_type_id` int(11) NOT NULL,
  `type_name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `days` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblar_customer_types`
--

INSERT INTO `tblar_customer_types` (`customer_type_id`, `type_name`, `description`, `days`) VALUES
(1, '15-days Customer', 'Regular customer', 15),
(2, '30-days Customer', 'Business customer with credit', 30);

-- --------------------------------------------------------

--
-- Table structure for table `tblar_debit_memo`
--

CREATE TABLE `tblar_debit_memo` (
  `debit_memo_id` int(11) NOT NULL,
  `ar_invoice_id` int(11) NOT NULL,
  `issue_date` date DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `issued_by_user_id` int(11) NOT NULL,
  `status` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblar_debit_memo`
--

INSERT INTO `tblar_debit_memo` (`debit_memo_id`, `ar_invoice_id`, `issue_date`, `amount`, `issued_by_user_id`, `status`) VALUES
(1, 2, '2026-09-20', 10.00, 3, 'Approved'),
(2, 1, '2026-09-20', 200.00, 3, 'Approved');

-- --------------------------------------------------------

--
-- Table structure for table `tblar_invoice`
--

CREATE TABLE `tblar_invoice` (
  `ar_invoice_id` int(11) NOT NULL,
  `invoice_number` varchar(100) DEFAULT NULL,
  `ar_customer_id` int(11) NOT NULL,
  `sale_id` int(11) NOT NULL,
  `created_by_user_id` int(11) NOT NULL,
  `invoice_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `invoice_amount` decimal(10,2) DEFAULT NULL,
  `balance` decimal(10,2) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblar_invoice`
--

INSERT INTO `tblar_invoice` (`ar_invoice_id`, `invoice_number`, `ar_customer_id`, `sale_id`, `created_by_user_id`, `invoice_date`, `due_date`, `invoice_amount`, `balance`, `status`) VALUES
(1, 'INV-2026-0001', 1, 1, 3, '2026-09-20', '2026-10-20', 50.00, 50.00, 'Open'),
(2, 'INV-2026-0002', 3, 2, 3, '2026-09-20', '2026-10-20', 90.00, 0.00, 'Paid'),
(3, 'INV-00000004', 1, 4, 3, '2026-09-20', '2026-10-20', 975.00, 375.00, 'Open'),
(4, 'INV-00000005', 1, 5, 3, '2026-09-26', '2026-10-26', 65.00, 0.00, 'Paid');

-- --------------------------------------------------------

--
-- Table structure for table `tblpayment_detail`
--

CREATE TABLE `tblpayment_detail` (
  `payment_detail_id` int(11) NOT NULL,
  `payment_id` int(11) NOT NULL,
  `ar_invoice_id` int(11) NOT NULL,
  `applied_amount` decimal(10,2) DEFAULT NULL,
  `applied_date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblpayment_detail`
--

INSERT INTO `tblpayment_detail` (`payment_detail_id`, `payment_id`, `ar_invoice_id`, `applied_amount`, `applied_date`) VALUES
(1, 1, 1, 25.00, '2026-09-20'),
(2, 2, 2, 50.00, '2026-09-20'),
(3, 9, 4, 60.00, '2026-09-26'),
(4, 10, 4, 5.00, '2026-09-26');

-- --------------------------------------------------------

--
-- Table structure for table `tblpayment_header`
--

CREATE TABLE `tblpayment_header` (
  `payment_id` int(11) NOT NULL,
  `payment_date` date DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `payment_method_id` int(11) NOT NULL,
  `processed_by_user_id` int(11) NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblpayment_header`
--

INSERT INTO `tblpayment_header` (`payment_id`, `payment_date`, `amount`, `payment_method_id`, `processed_by_user_id`, `reference_number`, `notes`) VALUES
(1, '2026-09-20', 25.00, 1, 3, 'CASH-0001', 'Partial payment'),
(2, '2026-09-20', 50.00, 2, 3, 'GCASH-0001', 'GCash payment'),
(9, '2026-09-26', 60.00, 1, 2, 'PAY-20260926-ba5000c81e87ee16', 'PAYMENT'),
(10, '2026-09-26', 5.00, 1, 2, 'PAY-20260926-b224383723c25d2a', '');

-- --------------------------------------------------------

--
-- Table structure for table `tblpayment_method`
--

CREATE TABLE `tblpayment_method` (
  `payment_method_id` int(11) NOT NULL,
  `method_name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblpayment_method`
--

INSERT INTO `tblpayment_method` (`payment_method_id`, `method_name`, `description`, `is_active`) VALUES
(1, 'Cash', 'Cash payment', 1),
(2, 'GCash', 'GCash payment', 1),
(3, 'Bank Transfer', 'Bank transfer payment', 1);

-- --------------------------------------------------------

--
-- Table structure for table `tblpos_terminals`
--

CREATE TABLE `tblpos_terminals` (
  `pos_terminal_id` int(11) NOT NULL,
  `terminal_name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblpos_terminals`
--

INSERT INTO `tblpos_terminals` (`pos_terminal_id`, `terminal_name`) VALUES
(1, 'Counter 1'),
(2, 'Counter 2');

-- --------------------------------------------------------

--
-- Table structure for table `tblproducts`
--

CREATE TABLE `tblproducts` (
  `product_id` int(11) NOT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `product_name` varchar(200) NOT NULL,
  `category_id` int(11) NOT NULL,
  `unit_of_measure_id` int(11) NOT NULL,
  `price_tier` varchar(100) DEFAULT NULL,
  `wholesale_price` decimal(10,2) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblproducts`
--

INSERT INTO `tblproducts` (`product_id`, `price`, `product_name`, `category_id`, `unit_of_measure_id`, `price_tier`, `wholesale_price`, `is_active`) VALUES
(1, 15.00, 'Lucky Me Pancit Canton', 1, 1, 'Retail', 12.00, 1),
(2, 25.00, 'Coca-Cola 1.5L', 2, 2, 'Retail', 20.00, 1),
(3, 10.00, 'Piattos Cheese', 3, 3, 'Retail', 8.00, 1),
(4, 65.00, 'Bear Brand Milk 300g', 1, 1, 'Retail', 55.00, 1),
(5, 20.00, 'Jack n Jill Chippy', 3, 3, 'Retail', 16.00, 1);

-- --------------------------------------------------------

--
-- Table structure for table `tblproduct_categories`
--

CREATE TABLE `tblproduct_categories` (
  `category_id` int(11) NOT NULL,
  `category_name` varchar(150) NOT NULL,
  `description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblproduct_categories`
--

INSERT INTO `tblproduct_categories` (`category_id`, `category_name`, `description`) VALUES
(1, 'Grocery', 'Basic grocery products'),
(2, 'Beverages', 'Drinks and beverages'),
(3, 'Snacks', 'Snack products');

-- --------------------------------------------------------

--
-- Table structure for table `tblproduct_promo`
--

CREATE TABLE `tblproduct_promo` (
  `product_promo_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `promo_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblproduct_promo`
--

INSERT INTO `tblproduct_promo` (`product_promo_id`, `product_id`, `promo_id`) VALUES
(1, 1, 1),
(2, 2, 1),
(3, 3, 2),
(4, 4, 1);

-- --------------------------------------------------------

--
-- Table structure for table `tblpromo`
--

CREATE TABLE `tblpromo` (
  `promo_id` int(11) NOT NULL,
  `promo_name` varchar(150) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `discount_rate` decimal(10,2) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblpromo`
--

INSERT INTO `tblpromo` (`promo_id`, `promo_name`, `description`, `start_date`, `end_date`, `discount_rate`, `is_active`) VALUES
(1, 'Christmas Sale', 'Christmas discount', '2026-12-01', '2026-12-31', 10.00, 1),
(2, 'Summer Sale', 'Summer discount', '2026-04-01', '2026-05-31', 5.00, 1);

-- --------------------------------------------------------

--
-- Table structure for table `tblroles`
--

CREATE TABLE `tblroles` (
  `role_id` int(11) NOT NULL,
  `role_name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblroles`
--

INSERT INTO `tblroles` (`role_id`, `role_name`, `description`) VALUES
(1, 'Admin', 'Manage users, roles, products, customers, settings, and view/manage the whole system'),
(2, 'Cashier', 'Process POS sales and handle customer transactions'),
(3, 'Accounts Receivable Staff', 'Manage invoices, payments, customer balances, credit/debit memos'),
(4, 'Manager', 'Monitor sales and AR, approve/oversee transactions, view reports');

-- --------------------------------------------------------

--
-- Table structure for table `tblsales`
--

CREATE TABLE `tblsales` (
  `sale_id` int(11) NOT NULL,
  `pos_terminal_id` int(11) NOT NULL,
  `cashier_user_id` int(11) NOT NULL,
  `sale_date` date NOT NULL,
  `sale_type` varchar(100) DEFAULT NULL,
  `payment_method_id` int(11) DEFAULT NULL,
  `ar_customer_id` int(11) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `tax_total` decimal(10,2) DEFAULT NULL,
  `total_amount` decimal(10,2) DEFAULT NULL,
  `balance` decimal(10,2) DEFAULT NULL,
  `suki_card_id` int(11) DEFAULT NULL,
  `suki_card_status` varchar(10) DEFAULT NULL,
  `suki_points_balance` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblsales`
--

INSERT INTO `tblsales` (`sale_id`, `pos_terminal_id`, `cashier_user_id`, `sale_date`, `sale_type`, `payment_method_id`, `ar_customer_id`, `price`, `tax_total`, `total_amount`, `balance`, `suki_card_id`, `suki_card_status`, `suki_points_balance`) VALUES
(1, 1, 2, '2026-09-20', 'Cash', NULL, NULL, 50.00, 0.00, 50.00, 0.00, NULL, NULL, NULL),
(2, 2, 2, '2026-09-20', 'Cash', NULL, NULL, 90.00, 0.00, 90.00, 0.00, NULL, NULL, NULL),
(3, 1, 1, '2026-09-20', 'Cash', NULL, NULL, 90.00, 10.80, 100.80, 0.00, NULL, NULL, NULL),
(4, 1, 2, '2026-09-20', 'AR', NULL, 1, 975.00, 0.00, 975.00, 975.00, NULL, NULL, NULL),
(5, 1, 2, '2026-09-26', 'AR', NULL, 1, 65.00, 0.00, 65.00, 65.00, NULL, NULL, NULL),
(6, 1, 2, '2026-09-26', 'Cash', NULL, NULL, 65.00, 0.00, 65.00, 0.00, NULL, NULL, NULL),
(7, 1, 2, '2026-09-29', 'AR', NULL, 1, 155.00, 0.00, 155.00, 155.00, 1, 'Has', 120.00),
(8, 2, 2, '2026-09-29', 'Cash', 1, NULL, 20.00, 0.00, 20.00, 0.00, NULL, 'None', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `tblsales_detail`
--

CREATE TABLE `tblsales_detail` (
  `sales_detail_id` int(11) NOT NULL,
  `sale_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `promo_id` int(11) DEFAULT NULL,
  `quantity` decimal(10,2) DEFAULT NULL,
  `unit_price` decimal(10,2) DEFAULT NULL,
  `discount` decimal(10,2) DEFAULT NULL,
  `promo_discount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `line_total` decimal(10,2) DEFAULT NULL,
  `cost_at_sale` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblsales_detail`
--

INSERT INTO `tblsales_detail` (`sales_detail_id`, `sale_id`, `product_id`, `promo_id`, `quantity`, `unit_price`, `discount`, `promo_discount`, `line_total`, `cost_at_sale`) VALUES
(1, 1, 1, NULL, 2.00, 15.00, 0.00, 0.00, 30.00, 24.00),
(2, 1, 3, NULL, 2.00, 10.00, 0.00, 0.00, 20.00, 16.00),
(3, 2, 2, NULL, 2.00, 25.00, 0.00, 0.00, 50.00, 40.00),
(4, 2, 4, NULL, 1.00, 40.00, 5.00, 0.00, 35.00, 30.00),
(5, 3, 4, NULL, 1.00, 65.00, 0.00, 0.00, 65.00, 65.00),
(6, 3, 2, NULL, 1.00, 25.00, 0.00, 0.00, 25.00, 25.00),
(7, 4, 4, NULL, 15.00, 65.00, 0.00, 0.00, 975.00, 65.00),
(8, 5, 4, NULL, 1.00, 65.00, 0.00, 0.00, 65.00, 65.00),
(9, 6, 4, NULL, 1.00, 65.00, 0.00, 0.00, 65.00, 65.00),
(10, 7, 4, NULL, 2.00, 65.00, 0.00, 0.00, 130.00, 65.00),
(11, 7, 2, NULL, 1.00, 25.00, 0.00, 0.00, 25.00, 25.00),
(12, 8, 5, NULL, 1.00, 20.00, 0.00, 0.00, 20.00, 20.00);

-- --------------------------------------------------------

--
-- Table structure for table `tblsku_card`
--

CREATE TABLE `tblsku_card` (
  `sku_card_id` int(11) NOT NULL,
  `ar_customer_id` int(11) NOT NULL,
  `card_number` varchar(100) DEFAULT NULL,
  `issued_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `points_balance` decimal(10,2) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblsku_card`
--

INSERT INTO `tblsku_card` (`sku_card_id`, `ar_customer_id`, `card_number`, `issued_date`, `expiry_date`, `points_balance`, `is_active`) VALUES
(1, 1, 'SUKI-0001', '2026-01-01', '2027-01-01', 120.00, 1),
(2, 2, 'SUKI-0002', '2026-02-01', '2027-02-01', 75.00, 1);

-- --------------------------------------------------------

--
-- Table structure for table `tblunit_of_measure`
--

CREATE TABLE `tblunit_of_measure` (
  `unit_of_measure_id` int(11) NOT NULL,
  `measure_name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblunit_of_measure`
--

INSERT INTO `tblunit_of_measure` (`unit_of_measure_id`, `measure_name`, `description`) VALUES
(1, 'Piece', 'Individual item'),
(2, 'Bottle', 'Per bottle'),
(3, 'Pack', 'Per package');

-- --------------------------------------------------------

--
-- Table structure for table `tblusers`
--

CREATE TABLE `tblusers` (
  `user_id` int(11) NOT NULL,
  `username` varchar(100) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `role_id` int(11) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tblusers`
--

INSERT INTO `tblusers` (`user_id`, `username`, `first_name`, `last_name`, `role_id`, `email`, `phone`, `password_hash`, `is_active`) VALUES
(1, 'admin', 'Juan', 'Dela Cruz', 1, 'juan@gmail.com', '09171234567', '$2y$10$cTNL73nLB7FnCmTPKLGnneAq7rZNMuBUXPphSzojZSTMix6t/Gd4q', 1),
(2, 'maria', 'Maria', 'Santos', 2, 'maria@gmail.com', '09181234567', '$2y$10$FxnQXXP7rNqEltzNKp9pueMXLXF3fJhSiCXJS3xeQ0Zc7f1aRqeEe', 1),
(3, 'pedro', 'Pedro', 'Reyes', 3, 'pedro@gmail.com', '09191234567', '$2y$10$pNRHO.2Qzos90jlZZBrV1..bVvx3xOBQ4SCRLBdR1GH5Fm0n/hqgK', 1),
(4, 'RC', 'RC', 'Baja', 4, 'rcbaja@gmail.com', '09123456789', '$2y$10$jow2.oj.8fLqVbHdg0k.oekTM//5wnIxEBYdbK3igNFJYaZBDHSbG', 1),
(5, 'ar_staff', 'AR', 'Staff', 3, 'ar_staff@pos.local', '09123456782', '$2y$10$pNRHO.2Qzos90jlZZBrV1..bVvx3xOBQ4SCRLBdR1GH5Fm0n/hqgK', 1);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `tblar_credit_memo`
--
ALTER TABLE `tblar_credit_memo`
  ADD PRIMARY KEY (`credit_memo_id`),
  ADD KEY `fk_credit_invoice` (`ar_invoice_id`),
  ADD KEY `fk_credit_user` (`issued_by_user_id`);

--
-- Indexes for table `tblar_customers`
--
ALTER TABLE `tblar_customers`
  ADD PRIMARY KEY (`ar_customer_id`),
  ADD KEY `fk_ar_customer_type` (`customer_type_id`);

--
-- Indexes for table `tblar_customer_types`
--
ALTER TABLE `tblar_customer_types`
  ADD PRIMARY KEY (`customer_type_id`);

--
-- Indexes for table `tblar_debit_memo`
--
ALTER TABLE `tblar_debit_memo`
  ADD PRIMARY KEY (`debit_memo_id`),
  ADD KEY `fk_debit_invoice` (`ar_invoice_id`),
  ADD KEY `fk_debit_user` (`issued_by_user_id`);

--
-- Indexes for table `tblar_invoice`
--
ALTER TABLE `tblar_invoice`
  ADD PRIMARY KEY (`ar_invoice_id`),
  ADD UNIQUE KEY `uq_invoice_sale` (`sale_id`),
  ADD KEY `fk_invoice_customer` (`ar_customer_id`),
  ADD KEY `fk_invoice_user` (`created_by_user_id`);

--
-- Indexes for table `tblpayment_detail`
--
ALTER TABLE `tblpayment_detail`
  ADD PRIMARY KEY (`payment_detail_id`),
  ADD KEY `fk_payment_detail_payment` (`payment_id`),
  ADD KEY `fk_payment_detail_invoice` (`ar_invoice_id`);

--
-- Indexes for table `tblpayment_header`
--
ALTER TABLE `tblpayment_header`
  ADD PRIMARY KEY (`payment_id`),
  ADD KEY `fk_payment_method` (`payment_method_id`),
  ADD KEY `fk_payment_user` (`processed_by_user_id`);

--
-- Indexes for table `tblpayment_method`
--
ALTER TABLE `tblpayment_method`
  ADD PRIMARY KEY (`payment_method_id`);

--
-- Indexes for table `tblpos_terminals`
--
ALTER TABLE `tblpos_terminals`
  ADD PRIMARY KEY (`pos_terminal_id`);

--
-- Indexes for table `tblproducts`
--
ALTER TABLE `tblproducts`
  ADD PRIMARY KEY (`product_id`),
  ADD KEY `fk_products_category` (`category_id`),
  ADD KEY `fk_products_unit_id` (`unit_of_measure_id`);

--
-- Indexes for table `tblproduct_categories`
--
ALTER TABLE `tblproduct_categories`
  ADD PRIMARY KEY (`category_id`);

--
-- Indexes for table `tblproduct_promo`
--
ALTER TABLE `tblproduct_promo`
  ADD PRIMARY KEY (`product_promo_id`),
  ADD KEY `fk_product_promo_product` (`product_id`),
  ADD KEY `fk_product_promo_promo` (`promo_id`);

--
-- Indexes for table `tblpromo`
--
ALTER TABLE `tblpromo`
  ADD PRIMARY KEY (`promo_id`);

--
-- Indexes for table `tblroles`
--
ALTER TABLE `tblroles`
  ADD PRIMARY KEY (`role_id`);

--
-- Indexes for table `tblsales`
--
ALTER TABLE `tblsales`
  ADD PRIMARY KEY (`sale_id`),
  ADD KEY `fk_sales_terminal` (`pos_terminal_id`),
  ADD KEY `fk_sales_cashier` (`cashier_user_id`),
  ADD KEY `fk_sales_suki_card` (`suki_card_id`),
  ADD KEY `fk_sales_ar_customer` (`ar_customer_id`),
  ADD KEY `fk_sales_payment_method` (`payment_method_id`);

--
-- Indexes for table `tblsales_detail`
--
ALTER TABLE `tblsales_detail`
  ADD PRIMARY KEY (`sales_detail_id`),
  ADD KEY `fk_sales_detail_sale` (`sale_id`),
  ADD KEY `fk_sales_detail_product` (`product_id`),
  ADD KEY `fk_sales_detail_promo` (`promo_id`);

--
-- Indexes for table `tblsku_card`
--
ALTER TABLE `tblsku_card`
  ADD PRIMARY KEY (`sku_card_id`),
  ADD KEY `fk_suki_customer` (`ar_customer_id`);

--
-- Indexes for table `tblunit_of_measure`
--
ALTER TABLE `tblunit_of_measure`
  ADD PRIMARY KEY (`unit_of_measure_id`),
  ADD UNIQUE KEY `measure_name` (`measure_name`);

--
-- Indexes for table `tblusers`
--
ALTER TABLE `tblusers`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD KEY `fk_users_role` (`role_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `tblar_credit_memo`
--
ALTER TABLE `tblar_credit_memo`
  MODIFY `credit_memo_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `tblar_customers`
--
ALTER TABLE `tblar_customers`
  MODIFY `ar_customer_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `tblar_customer_types`
--
ALTER TABLE `tblar_customer_types`
  MODIFY `customer_type_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `tblar_debit_memo`
--
ALTER TABLE `tblar_debit_memo`
  MODIFY `debit_memo_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `tblar_invoice`
--
ALTER TABLE `tblar_invoice`
  MODIFY `ar_invoice_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `tblpayment_detail`
--
ALTER TABLE `tblpayment_detail`
  MODIFY `payment_detail_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `tblpayment_header`
--
ALTER TABLE `tblpayment_header`
  MODIFY `payment_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `tblpayment_method`
--
ALTER TABLE `tblpayment_method`
  MODIFY `payment_method_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `tblpos_terminals`
--
ALTER TABLE `tblpos_terminals`
  MODIFY `pos_terminal_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `tblproducts`
--
ALTER TABLE `tblproducts`
  MODIFY `product_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `tblproduct_categories`
--
ALTER TABLE `tblproduct_categories`
  MODIFY `category_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `tblproduct_promo`
--
ALTER TABLE `tblproduct_promo`
  MODIFY `product_promo_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `tblpromo`
--
ALTER TABLE `tblpromo`
  MODIFY `promo_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `tblroles`
--
ALTER TABLE `tblroles`
  MODIFY `role_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `tblsales`
--
ALTER TABLE `tblsales`
  MODIFY `sale_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `tblsales_detail`
--
ALTER TABLE `tblsales_detail`
  MODIFY `sales_detail_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `tblsku_card`
--
ALTER TABLE `tblsku_card`
  MODIFY `sku_card_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `tblunit_of_measure`
--
ALTER TABLE `tblunit_of_measure`
  MODIFY `unit_of_measure_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `tblusers`
--
ALTER TABLE `tblusers`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `tblar_credit_memo`
--
ALTER TABLE `tblar_credit_memo`
  ADD CONSTRAINT `fk_credit_invoice` FOREIGN KEY (`ar_invoice_id`) REFERENCES `tblar_invoice` (`ar_invoice_id`),
  ADD CONSTRAINT `fk_credit_user` FOREIGN KEY (`issued_by_user_id`) REFERENCES `tblusers` (`user_id`);

--
-- Constraints for table `tblar_customers`
--
ALTER TABLE `tblar_customers`
  ADD CONSTRAINT `fk_ar_customer_type` FOREIGN KEY (`customer_type_id`) REFERENCES `tblar_customer_types` (`customer_type_id`);

--
-- Constraints for table `tblar_debit_memo`
--
ALTER TABLE `tblar_debit_memo`
  ADD CONSTRAINT `fk_debit_invoice` FOREIGN KEY (`ar_invoice_id`) REFERENCES `tblar_invoice` (`ar_invoice_id`),
  ADD CONSTRAINT `fk_debit_user` FOREIGN KEY (`issued_by_user_id`) REFERENCES `tblusers` (`user_id`);

--
-- Constraints for table `tblar_invoice`
--
ALTER TABLE `tblar_invoice`
  ADD CONSTRAINT `fk_invoice_customer` FOREIGN KEY (`ar_customer_id`) REFERENCES `tblar_customers` (`ar_customer_id`),
  ADD CONSTRAINT `fk_invoice_sale` FOREIGN KEY (`sale_id`) REFERENCES `tblsales` (`sale_id`),
  ADD CONSTRAINT `fk_invoice_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `tblusers` (`user_id`);

--
-- Constraints for table `tblpayment_detail`
--
ALTER TABLE `tblpayment_detail`
  ADD CONSTRAINT `fk_payment_detail_invoice` FOREIGN KEY (`ar_invoice_id`) REFERENCES `tblar_invoice` (`ar_invoice_id`),
  ADD CONSTRAINT `fk_payment_detail_payment` FOREIGN KEY (`payment_id`) REFERENCES `tblpayment_header` (`payment_id`);

--
-- Constraints for table `tblpayment_header`
--
ALTER TABLE `tblpayment_header`
  ADD CONSTRAINT `fk_payment_method` FOREIGN KEY (`payment_method_id`) REFERENCES `tblpayment_method` (`payment_method_id`),
  ADD CONSTRAINT `fk_payment_user` FOREIGN KEY (`processed_by_user_id`) REFERENCES `tblusers` (`user_id`);

--
-- Constraints for table `tblproducts`
--
ALTER TABLE `tblproducts`
  ADD CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `tblproduct_categories` (`category_id`),
  ADD CONSTRAINT `fk_products_unit_id` FOREIGN KEY (`unit_of_measure_id`) REFERENCES `tblunit_of_measure` (`unit_of_measure_id`);

--
-- Constraints for table `tblproduct_promo`
--
ALTER TABLE `tblproduct_promo`
  ADD CONSTRAINT `fk_product_promo_product` FOREIGN KEY (`product_id`) REFERENCES `tblproducts` (`product_id`),
  ADD CONSTRAINT `fk_product_promo_promo` FOREIGN KEY (`promo_id`) REFERENCES `tblpromo` (`promo_id`);

--
-- Constraints for table `tblsales`
--
ALTER TABLE `tblsales`
  ADD CONSTRAINT `fk_sales_ar_customer` FOREIGN KEY (`ar_customer_id`) REFERENCES `tblar_customers` (`ar_customer_id`),
  ADD CONSTRAINT `fk_sales_cashier` FOREIGN KEY (`cashier_user_id`) REFERENCES `tblusers` (`user_id`),
  ADD CONSTRAINT `fk_sales_payment_method` FOREIGN KEY (`payment_method_id`) REFERENCES `tblpayment_method` (`payment_method_id`),
  ADD CONSTRAINT `fk_sales_suki_card` FOREIGN KEY (`suki_card_id`) REFERENCES `tblsku_card` (`sku_card_id`),
  ADD CONSTRAINT `fk_sales_terminal` FOREIGN KEY (`pos_terminal_id`) REFERENCES `tblpos_terminals` (`pos_terminal_id`);

--
-- Constraints for table `tblsales_detail`
--
ALTER TABLE `tblsales_detail`
  ADD CONSTRAINT `fk_sales_detail_product` FOREIGN KEY (`product_id`) REFERENCES `tblproducts` (`product_id`),
  ADD CONSTRAINT `fk_sales_detail_promo` FOREIGN KEY (`promo_id`) REFERENCES `tblpromo` (`promo_id`),
  ADD CONSTRAINT `fk_sales_detail_sale` FOREIGN KEY (`sale_id`) REFERENCES `tblsales` (`sale_id`);

--
-- Constraints for table `tblsku_card`
--
ALTER TABLE `tblsku_card`
  ADD CONSTRAINT `fk_suki_customer` FOREIGN KEY (`ar_customer_id`) REFERENCES `tblar_customers` (`ar_customer_id`);

--
-- Constraints for table `tblusers`
--
ALTER TABLE `tblusers`
  ADD CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `tblroles` (`role_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
