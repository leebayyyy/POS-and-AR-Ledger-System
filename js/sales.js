import { getSession, logoutUser, confirmLogout } from "./auth.js?v=20261022";
import { showToast, showError, showSuccess, showConfirm } from "./swal-helper.js";

const apiUrl = "api/sales.php";
const SALE_MODE = Object.freeze({ CASH: "Cash", AR: "AR" });
let products = [];
let cart = [];
let currentSaleMode = SALE_MODE.CASH;
let currentUser = null;
let sukiCards = [];
let arCustomers = [];
let activeCartIndex = -1;
let isSubmitting = false;
let isOpeningTenderModal = false;
let tenderOpenLockTimeout = null;
let allSalesData = [];
let selectedReceiptSaleId = null;
let activeHeldId = null;
let activeHoldRef = null;
let allHeldTransactions = [];
let filteredHeldTransactions = [];

// Revisions State (Shift, Drawer Events, Supervisor Overrides, Lookup Navigation)
let currentShiftId = null;
let minOpeningFloat = 0.0;
let customDiscountThresholdPct = 10.0;
let customDiscountThresholdAmt = 100.0;
let arOverduePolicy = { default_term_days: 30, block_overdue_accounts: 1 };
let approvedDiscountSupervisorId = null;
let approvedDiscountSignature = "";
let isAbandoningShiftSession = false;
let isSessionLockedPostEos = false;
let pendingEosSupervisorAuth = null;
let currentEosSummary = null;
let closedShiftsData = [];
let selectedArchiveMode = "sales"; // "sales" | "eos"
let selectedClosedShiftId = null;
let supervisorAuthResolve = null;
let supervisorAuthReject = null;
let activeDrawerEventType = "float";
let searchResultIndex = -1;
let currentSearchResults = [];
let activeHeldRecordIndex = 0;
let activePresetIndex = -1;
let currentLogicalZone = 1;
let activeSupervisorActionType = "";
let activeSupervisorTargetRef = "";
const keyboardDropdowns = new Map();
let openKeyboardDropdown = null;
const quickCashPresets = ["exact", "50", "100", "200", "500", "1000"];

/* ==========================================================================
   Payment Method Modal Selection (FIX 2)
   ========================================================================== */
let availablePaymentMethods = [
  { payment_method_id: 1, method_name: "Cash" },
  { payment_method_id: 2, method_name: "GCash" },
  { payment_method_id: 3, method_name: "Bank Transfer" }
];
let selectedPaymentMethodIndex = 0;
let prePaymentModalFocus = null;

const selectPaymentMethodSilent = (idx) => {
  if (idx >= 0 && idx < availablePaymentMethods.length) {
    selectedPaymentMethodIndex = idx;
    const method = availablePaymentMethods[idx];
    const hiddenInput = document.getElementById("sale_payment_method_id");
    if (hiddenInput) {
      hiddenInput.value = method.payment_method_id;
    }
    const nameEl = document.getElementById("payment-method-name");
    if (nameEl) nameEl.textContent = method.method_name;

    const modeBadge = document.getElementById("pos-mode-badge");
    if (modeBadge) modeBadge.textContent = "MODE: " + method.method_name.toUpperCase();
  }
};

const highlightPaymentMethodOption = (idx) => {
  const container = document.getElementById("payment-method-list");
  if (!container) return;
  const items = container.querySelectorAll(".payment-method-option");
  items.forEach((item, i) => {
    const isHighlight = i === idx;
    item.classList.toggle("is-highlighted", isHighlight);
    item.classList.toggle("active", isHighlight);
    item.setAttribute("aria-selected", isHighlight ? "true" : "false");
    if (isHighlight) {
      item.focus();
    }
  });
};

const renderPaymentMethodList = () => {
  const container = document.getElementById("payment-method-list");
  if (!container) return;
  const currentVal = String(document.getElementById("sale_payment_method_id")?.value || "1");
  const foundIdx = availablePaymentMethods.findIndex(m => String(m.payment_method_id) === currentVal);
  if (foundIdx >= 0) selectedPaymentMethodIndex = foundIdx;
  else selectedPaymentMethodIndex = 0;

  container.innerHTML = availablePaymentMethods.map((pm, idx) => {
    const isSelected = idx === selectedPaymentMethodIndex;
    const isCash = pm.method_name.toLowerCase().includes("cash");
    return `
      <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 payment-method-option ${isSelected ? "is-highlighted active" : ""}" data-index="${idx}" data-id="${pm.payment_method_id}" role="option" aria-selected="${isSelected}">
        <span class="d-flex align-items-center gap-2">
          <span class="badge ${isCash ? "bg-success" : "bg-primary"} font-monospace">${idx + 1}</span>
          <span class="fw-bold">${pm.method_name}</span>
        </span>
        ${isSelected ? '<span class="badge bg-light text-dark fw-bold border">&#10003; Active</span>' : ''}
      </button>
    `;
  }).join("");

  container.querySelectorAll(".payment-method-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-index"));
      selectPaymentMethod(idx);
    });
  });
};

const openPaymentMethodModal = () => {
  prePaymentModalFocus = document.activeElement || document.getElementById("payment-method-control");
  renderPaymentMethodList();
  const modalEl = document.getElementById("payment-method-modal");
  if (modalEl) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: "static", keyboard: false });
    modal.show();
    setTimeout(() => {
      highlightPaymentMethodOption(selectedPaymentMethodIndex);
    }, 50);
  }
};

const closePaymentMethodModal = () => {
  const modalEl = document.getElementById("payment-method-modal");
  if (modalEl) {
    bootstrap.Modal.getInstance(modalEl)?.hide();
  }
  if (prePaymentModalFocus && document.body.contains(prePaymentModalFocus)) {
    setSpatialFocus(prePaymentModalFocus);
    prePaymentModalFocus.focus();
  } else {
    const ctrl = document.getElementById("payment-method-control");
    if (ctrl) {
      setSpatialFocus(ctrl);
      ctrl.focus();
    } else {
      focusBarcodeInput();
    }
  }
};

const selectPaymentMethod = (idx) => {
  if (idx >= 0 && idx < availablePaymentMethods.length) {
    selectPaymentMethodSilent(idx);
    const method = availablePaymentMethods[idx];
    showScanFeedback(`Payment method set to ${method.method_name}.`);
  }
  closePaymentMethodModal();
  // Non-tender behavior: NEVER calls checkout/tender!
};

const initPosRegister = () => {
  document.getElementById("payment-method-control")?.addEventListener("click", openPaymentMethodModal);
  document.getElementById("btn-cancel-clear-cart")?.addEventListener("click", cancelClearCart);
  document.getElementById("btn-confirm-clear-cart")?.addEventListener("click", confirmClearCart);
  document.getElementById("btn-close-clear-cart")?.addEventListener("click", cancelClearCart);
  document.getElementById("btn-cancel-payment-method")?.addEventListener("click", closePaymentMethodModal);
  document.getElementById("btn-confirm-payment-method")?.addEventListener("click", () => selectPaymentMethod(selectedPaymentMethodIndex));
  document.getElementById("btn-close-payment-method")?.addEventListener("click", closePaymentMethodModal);

  // SUKI Loyalty Toggle & Hotkey wiring (FIX 1)
  const sukiToggle = document.getElementById("suki-card-toggle");
  if (sukiToggle) {
    sukiToggle.addEventListener("change", () => {
      syncSukiToggleUI(sukiToggle.checked);
      showScanFeedback("SUKI Card: " + (sukiToggle.checked ? "Attached" : "Removed"));
    });
    sukiToggle.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toggleSukiCard();
      }
    });
  }
  document.getElementById("btn-hk-suki")?.addEventListener("click", () => {
    toggleSukiCard();
  });
  document.addEventListener("pointerdown", (event) => {
    if (openKeyboardDropdown && !openKeyboardDropdown.button.parentElement.contains(event.target)) {
      closeKeyboardDropdown(openKeyboardDropdown, false);
    }
  });

  // Cashier View Switching Listener (dispatched from page-auth navbar)
  window.addEventListener("pos:switch-view", (e) => {
    switchPosView(e.detail?.view || "view-checkout");
  });

  // Navigation & Register Toggle
  document.getElementById("btn-new-sale")?.addEventListener("click", startSale);
  document.getElementById("btn-cancel-sale")?.addEventListener("click", requestClearCart);

  // Fallback / standard item add button
  document.getElementById("btn-add-item")?.addEventListener("click", addItemFromDropdown);

  // Mode radio buttons (CASH / AR CREDIT segmented toggle)
  document.getElementById("mode-cash")?.addEventListener("change", () => setSaleMode(SALE_MODE.CASH));
  document.getElementById("mode-ar")?.addEventListener("change", () => setSaleMode(SALE_MODE.AR));

  // Form field change listeners
  document.getElementById("ar_customer_id")?.addEventListener("change", () => {
    updateSukiFields();
    refreshCreditEligibility();
  });
  document.getElementById("suki_card_status")?.addEventListener("change", updateSukiFields);
  document.getElementById("suki_card_id")?.addEventListener("change", updateSukiFields);
  document.getElementById("tax_rate")?.addEventListener("input", renderCart);

  // Prevent implicit checkout; tender starts only via F12 or the checkout button.
  document.getElementById("sale-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
  });

  // Quantity-First: Cashier types quantity -> Enter -> focus moves to barcode input
  const qtyInput = document.getElementById("quantity");
  qtyInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const val = Number(qtyInput.value || 1);
      if (val < 1) qtyInput.value = 1;
      focusBarcodeInput();
    }
  });

  // Barcode / Keyboard-First Scanner Entry
  const barcodeInput = document.getElementById("barcode-input");
  barcodeInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (isAnyModalOpen() || isDiscountPanelActive()) return;
      handleBarcodeScan();
    }
  });

  // Action Buttons & Modals
  document.getElementById("btn-open-tender")?.addEventListener("click", triggerActiveCheckout);
  document.getElementById("btn-submit-tender")?.addEventListener("click", executeCheckout);
  document.getElementById("btn-open-search")?.addEventListener("click", openProductSearchModal);
  document.getElementById("btn-open-qty")?.addEventListener("click", openQuantityModal);
  document.getElementById("btn-confirm-qty")?.addEventListener("click", confirmQuantityOverride);
  document.getElementById("btn-void-item")?.addEventListener("click", voidActiveItem);
  document.getElementById("btn-void-sale")?.addEventListener("click", requestVoidTransaction);
  document.getElementById("btn-hold-sale")?.addEventListener("click", triggerHoldTransaction);
  document.getElementById("btn-confirm-hold")?.addEventListener("click", executeHold);
  document.getElementById("btn-resume-sale")?.addEventListener("click", openResumeModal);

  // Hotkey Dock Buttons
  document.getElementById("btn-hk-search")?.addEventListener("click", openProductSearchModal);
  document.getElementById("btn-hk-lookup")?.addEventListener("click", openProductSearchModal);
  document.getElementById("btn-hk-qty")?.addEventListener("click", focusQuantityInput);
  document.getElementById("btn-hk-void")?.addEventListener("click", voidActiveItem);
  document.getElementById("btn-hk-void-trans")?.addEventListener("click", requestVoidTransaction);
  document.getElementById("btn-hk-hold")?.addEventListener("click", triggerHoldTransaction);
  document.getElementById("btn-hk-drawer")?.addEventListener("click", () => openDrawerEventModal());
  document.getElementById("btn-hk-ar")?.addEventListener("click", openArCustomerFlow);
  document.getElementById("btn-hk-cash-mode")?.addEventListener("click", () => {
    setSaleMode(SALE_MODE.CASH);
    const pmCtrl = document.getElementById("payment-method-control");
    if (pmCtrl) {
      setSpatialFocus(pmCtrl);
      pmCtrl.focus();
    }
    openPaymentMethodModal();
  });
  document.getElementById("btn-hk-resume")?.addEventListener("click", openResumeModal);
  document.getElementById("btn-hk-fullscreen")?.addEventListener("click", toggleFullscreen);
  document.getElementById("btn-hk-complete")?.addEventListener("click", triggerActiveCheckout);
  document.getElementById("btn-hk-discount")?.addEventListener("click", () => {
    openDiscountModal();
  });
  document.getElementById("btn-hk-eos")?.addEventListener("click", initiateEndOfShift);
  document.getElementById("btn-hk-cancel")?.addEventListener("click", () => {
    if (!isAnyModalOpen()) {
      requestClearCart();
      return;
    }

    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Home",
      code: "Home",
      bubbles: true,
      cancelable: true
    }));
  });
  document.getElementById("drawer-type-float")?.addEventListener("change", () => setDrawerEventType("float"));
  document.getElementById("drawer-type-lift")?.addEventListener("change", () => setDrawerEventType("lift"));

  // Supervisor Modal Listeners
  document.getElementById("btn-sup-submit")?.addEventListener("click", handleSupervisorSubmit);
  document.getElementById("btn-sup-cancel")?.addEventListener("click", handleSupervisorCancel);
  document.getElementById("btn-sup-close")?.addEventListener("click", handleSupervisorCancel);
  document.getElementById("supervisor-username")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      setSpatialFocus(document.getElementById("supervisor-password"));
    }
  });
  document.getElementById("supervisor-password")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleSupervisorSubmit();
    }
  });

  // Beginning Cash & Shift Management Listeners (WP-1)
  document.getElementById("btn-confirm-beginning-cash")?.addEventListener("click", confirmBeginningCash);
  document.getElementById("btn-cancel-logout-shift")?.addEventListener("click", cancelAndLogoutShift);
  document.getElementById("btn-open-beginning-cash")?.addEventListener("click", () => {
    if (currentShiftId) {
      initiateEndOfShift();
    } else {
      promptBeginningCash();
    }
  });
  document.getElementById("pos-shift-badge")?.addEventListener("click", () => {
    if (currentShiftId) {
      initiateEndOfShift();
    } else {
      promptBeginningCash();
    }
  });
  document.getElementById("btn-end-shift")?.addEventListener("click", () => {
    bootstrap.Modal.getInstance(document.getElementById("beginning-cash-modal"))?.hide();
    initiateEndOfShift();
  });
  document.getElementById("beginning-cash-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      confirmBeginningCash();
    }
  });
  document.getElementById("beginning-cash-modal")?.addEventListener("hide.bs.modal", (e) => {
    if (currentShiftId === null && !isAbandoningShiftSession && currentUser?.role_name === "Cashier") {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  });

  // End of Shift (EOS) Reconciliation Modal Listeners (WP-1 1B)
  document.getElementById("eos-actual-cash-input")?.addEventListener("input", updateEosVarianceLive);
  document.getElementById("eos-actual-cash-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      confirmEndOfShift();
    }
  });
  document.getElementById("btn-confirm-eos")?.addEventListener("click", confirmEndOfShift);
  document.getElementById("btn-cancel-eos")?.addEventListener("click", cancelEndOfShift);
  document.getElementById("btn-close-eos-modal")?.addEventListener("click", cancelEndOfShift);
  document.getElementById("btn-print-eos-report")?.addEventListener("click", printActiveEosReport);
  document.getElementById("btn-eos-exit-login")?.addEventListener("click", exitPostEosSession);
  document.getElementById("eos-modal")?.addEventListener("hide.bs.modal", (e) => {
    if (isSessionLockedPostEos && !isAbandoningShiftSession) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  });

  // Drawer Event Modal Listeners
  document.getElementById("btn-submit-drawer-event")?.addEventListener("click", submitDrawerEvent);

  // Clear Cart Confirmation Modal Button
  document.getElementById("btn-confirm-clear-cart")?.addEventListener("click", () => {
    closeSale();
    bootstrap.Modal.getInstance(document.getElementById("clear-cart-confirm-modal"))?.hide();
  });

  // Product Search Query Input
  document.getElementById("product-search-query")?.addEventListener("input", filterProductSearchResults);

  // WP-4 4A / FIX 2: AR Customer Search Filter & Typeahead on Register
  const arSearchInput = document.getElementById("ar-customer-search-filter");
  if (arSearchInput) {
    arSearchInput.addEventListener("input", handleArCustomerSearchInput);
    arSearchInput.addEventListener("keydown", handleArCustomerSearchKeydown);
    arSearchInput.addEventListener("blur", () => {
      setTimeout(closeArCustomerTypeahead, 200);
    });
  }

  // WP-4 4B / FIX 1 & FIX 2: Discount Modal Controls & Button Listeners
  document.getElementById("btn-open-discount-modal")?.addEventListener("click", () => {
    openDiscountModal();
  });
  document.getElementById("discount-section")?.addEventListener("click", (e) => {
    if (e.target && e.target.closest("#btn-open-discount-modal")) return;
    openDiscountModal();
  });
  document.getElementById("opt-disc-senior")?.addEventListener("click", () => {
    switchToDiscountIdPhase("senior");
  });
  document.getElementById("opt-disc-pwd")?.addEventListener("click", () => {
    switchToDiscountIdPhase("pwd");
  });
  document.getElementById("opt-disc-zero")?.addEventListener("click", () => {
    handleNoDiscountSelection();
  });
  document.getElementById("opt-disc-none")?.addEventListener("click", () => {
    removeDiscountAndClose();
  });
  document.getElementById("btn-back-discount-phase")?.addEventListener("click", () => {
    switchToDiscountTypePhase();
  });
  document.getElementById("btn-confirm-discount-phase")?.addEventListener("click", () => {
    applyStatutoryDiscountFromModal();
  });
  document.getElementById("btn-cancel-discount-modal")?.addEventListener("click", () => {
    closeDiscountModal();
  });
  document.getElementById("btn-close-discount-modal")?.addEventListener("click", () => {
    closeDiscountModal();
  });
  document.getElementById("btn-print-receipt")?.addEventListener("click", () => {
    handleReceiptPrintClick();
  });
  document.getElementById("btn-close-receipt")?.addEventListener("click", () => {
    closeReceiptModal();
  });
  document.getElementById("btn-close-receipt-modal")?.addEventListener("click", () => {
    closeReceiptModal();
  });
  document.getElementById("discount-modal-id-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      applyStatutoryDiscountFromModal();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      switchToDiscountTypePhase();
    }
  });

  // Held Sales Search Filter & Hold Input Enter
  document.getElementById("held-search-filter")?.addEventListener("input", filterHeldTransactions);
  document.getElementById("hold-customer-label")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      executeHold();
    }
  });

  // Recent Sales Filter & Refresh
  document.getElementById("sales-search-filter")?.addEventListener("input", filterRecentSales);
  document.getElementById("btn-refresh-sales")?.addEventListener("click", loadSales);

  // Receipts & EOS Reports Archive Search & Reprint
  document.getElementById("receipt-lookup-id")?.addEventListener("input", filterReceiptHistory);
  document.getElementById("btn-reprint-receipt")?.addEventListener("click", reprintSelectedReceipt);
  document.getElementById("btn-archive-mode-sales")?.addEventListener("click", () => switchArchiveMode("sales"));
  document.getElementById("btn-archive-mode-eos")?.addEventListener("click", () => switchArchiveMode("eos"));

  // Quantity Modal Enter Key
  document.getElementById("qty-override-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmQuantityOverride();
    }
  });

  // Tender Modal Cash Input Listener (Live Sukli Calculation)
  const tenderCashInput = document.getElementById("tender-cash-input");
  tenderCashInput?.addEventListener("input", updateSukliCalculator);
  tenderCashInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeCheckout();
    }
  });
  document.getElementById("tender-modal")?.addEventListener("hide.bs.modal", () => {
    releaseTenderOpenLock();
  });
  document.getElementById("tender-modal")?.addEventListener("hidden.bs.modal", () => {
    releaseTenderOpenLock();
  });

  // Quick Cash Preset Buttons
  document.querySelectorAll(".pos-quick-cash-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleQuickCashPreset(btn.dataset.preset));
  });

  // Navigation & Mode Controls
  document.getElementById("btn-focus-qty")?.addEventListener("click", focusQuantityInput);
  document.getElementById("btn-mode-cash")?.addEventListener("click", () => setSaleMode(SALE_MODE.CASH));
  document.getElementById("btn-mode-ar")?.addEventListener("click", () => setSaleMode(SALE_MODE.AR));
  updateSaleTypeFields();
  updateModeBadge();

  document.getElementById("nav-tab-checkout")?.addEventListener("click", () => switchPosView("view-checkout"));
  document.getElementById("nav-tab-recent")?.addEventListener("click", () => switchPosView("view-recent-sales"));
  document.getElementById("nav-tab-receipts")?.addEventListener("click", () => switchPosView("view-receipts"));
  document.getElementById("btn-cashier-logout")?.addEventListener("click", () => confirmLogout());

  window.addEventListener("pos:switch-view", (e) => {
    const viewId = e.detail?.view;
    if (viewId) {
      switchPosView(viewId);
    }
  });

  // Modal Focus Restoration & Clean Transition
  const allModalIds = [
    "tender-modal",
    "product-search-modal",
    "quantity-modal",
    "receipt-modal",
    "clear-cart-confirm-modal",
    "hold-transaction-modal",
    "resume-transaction-modal",
    "supervisor-modal",
    "beginning-cash-modal",
    "eos-modal",
    "drawer-event-modal",
    "hotkey-reference-modal",
    "discount-selection-modal",
    "payment-method-modal"
  ];

  allModalIds.forEach((modalId) => {
    const el = document.getElementById(modalId);
    el?.addEventListener("hidden.bs.modal", () => {
      // Clear any kb-focus from modal elements and container
      el.querySelectorAll(".kb-focus").forEach((f) => f.classList.remove("kb-focus"));
      el.classList.remove("kb-focus");

      if (modalId === "beginning-cash-modal" && currentShiftId === null && currentUser?.role_name === "Cashier") {
        showScanFeedback("Shift is not yet opened. Click 'Beginning Cash' or the shift badge to start shift.", true);
        const shiftBadge = document.getElementById("pos-shift-badge");
        if (shiftBadge) setSpatialFocus(shiftBadge);
        return;
      }

      if (modalId === "drawer-event-modal") {
        const amountInput = document.getElementById("drawer-event-amount");
        if (amountInput) amountInput.value = "0";
        const notesInput = document.getElementById("drawer-event-notes");
        if (notesInput) notesInput.value = "";
      }

      const scan = document.getElementById("barcode-input");
      if (scan && !isAnyModalOpen()) {
        setSpatialFocus(scan);
        focusBarcodeInput();
      }
    });

    el?.addEventListener("shown.bs.modal", () => {
      // Never allow modal backdrop or container to retain kb-focus
      el.classList.remove("kb-focus");
      const modalDialog = el.querySelector(".modal-dialog");
      const modalContent = el.querySelector(".modal-content");
      if (modalDialog) modalDialog.classList.remove("kb-focus");
      if (modalContent) modalContent.classList.remove("kb-focus");

      if (modalId === "clear-cart-confirm-modal") {
        el.focus();
        return;
      }

      const target = modalId === "drawer-event-modal"
        ? document.getElementById("btn-drawer-type-float")
        : el.querySelector("[autofocus]") ||
          el.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), button:not([disabled]):not(.btn-close)');
      if (target) {
        setSpatialFocus(target);
        if (modalId === "drawer-event-modal") target.focus();
        if (typeof target.select === "function") {
          target.select();
        }
      }
    });
  });

  // Focus Synchronization across the DOM - only interactive controls receive spatial highlight
  const isNavigableInteractive = (el) => {
    if (!el || el === document.body || !el.isConnected) return false;
    if (el.classList.contains("modal") || el.classList.contains("modal-dialog") || el.classList.contains("modal-content") || el.classList.contains("modal-body")) {
      return false;
    }
    if (el.closest?.(".swal2-container")) return false;
    const tag = el.tagName;
    if (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(tag)) return true;
    if (el.getAttribute("role") === "button" || el.getAttribute("role") === "option" || el.getAttribute("role") === "tab") return true;
    if (el.id === "cart-table" || el.classList.contains("pos-cart-row")) return true;
    if (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") return true;
    return false;
  };

  document.addEventListener("focusin", (e) => {
    if (isNavigableInteractive(e.target)) {
      document.querySelectorAll(".kb-focus").forEach((el) => {
        if (el !== e.target) el.classList.remove("kb-focus");
      });
      e.target.classList.add("kb-focus");
      currentSpatialFocusEl = e.target;
    } else {
      if (e.target && (e.target.classList?.contains("modal") || e.target.closest?.(".modal-content") === e.target)) {
        e.target.classList?.remove("kb-focus");
      }
    }
  });

  window.addEventListener("focus", ensureFocusNeverLost);
  document.addEventListener("focusout", () => {
    setTimeout(ensureFocusNeverLost, 50);
  });

  // Global Keyboard Navigation (Topmost modal Escape consumer in capture phase)
  window.addEventListener("keydown", handleTopmostModalEscape, true);
  // FIX 3: Capture-phase suppression for Alt+D to prevent Chrome & Firefox Omnibox / address bar conflict
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "d" || e.key === "D" || e.code === "KeyD")) {
      e.preventDefault();
      e.stopPropagation();
      if (!isAnyModalOpen()) {
        openDiscountKeyboardFlow();
      }
    }
  }, true);
  window.addEventListener("keydown", handleGlobalShortcuts);

  // Live Clock
  startLiveClock();

  // Load Data & Shifts
  loadFormData();
  loadSales();
};


/* ==========================================================================
   Live Clock & Header Info
   ========================================================================== */
const startLiveClock = () => {
  const clockEl = document.getElementById("pos-clock");
  const tick = () => {
    if (clockEl) {
      const now = new Date();
      clockEl.textContent = now.toLocaleDateString() + " " + now.toLocaleTimeString();
    }
  };
  tick();
  setInterval(tick, 1000);
};

const updateModeBadge = () => {
  const modeBadge = document.getElementById("pos-mode-badge");
  const isAr = currentSaleMode === SALE_MODE.AR;
  if (modeBadge) {
    modeBadge.textContent = isAr ? "MODE: AR CREDIT" : "MODE: CASH";
    modeBadge.className = `badge ${isAr ? "bg-warning text-dark" : "bg-success"}`;
  }
};

const setSaleMode = (mode) => {
  const normalizedMode = String(mode || "").trim().toLowerCase() === "ar"
    ? SALE_MODE.AR
    : SALE_MODE.CASH;
  const customerField = document.getElementById("customer-field");
  const customerDropdown = keyboardDropdowns.get("ar_customer_id");
  const customerPickerHasFocus = Boolean(
    customerField?.contains(document.activeElement) ||
    (openKeyboardDropdown && openKeyboardDropdown === customerDropdown)
  );

  if (normalizedMode === SALE_MODE.CASH && customerDropdown && openKeyboardDropdown === customerDropdown) {
    closeKeyboardDropdown(customerDropdown, false);
  }
  currentSaleMode = normalizedMode;

  const cashRadio = document.getElementById("mode-cash");
  const arRadio = document.getElementById("mode-ar");
  if (cashRadio) cashRadio.checked = currentSaleMode === SALE_MODE.CASH;
  if (arRadio) arRadio.checked = currentSaleMode === SALE_MODE.AR;

  updateSaleTypeFields();
  updateModeBadge();
  showScanFeedback(`Switched to ${currentSaleMode === SALE_MODE.AR ? "AR Credit (Utang)" : "Cash"} mode.`);
  if (normalizedMode === SALE_MODE.CASH && customerPickerHasFocus) focusBarcodeInput();
};

/* ==========================================================================
   Data Loading & Initialization
   ========================================================================== */
const loadFormData = async () => {
  try {
    const { data } = await axios.get(apiUrl, { params: { operation: "getFormData" } });
    const session = await getSession();
    currentUser = session.user;

    const cashierNameEl = document.getElementById("pos-cashier-name");
    if (cashierNameEl && currentUser) {
      cashierNameEl.textContent = `${currentUser.first_name} ${currentUser.last_name} (${currentUser.role_name})`;
    }

    document.getElementById("btn-new-sale")?.classList.toggle("d-none", currentUser?.role_name !== "Cashier");
    products = data.products || [];
    sukiCards = data.sukiCards || [];
    arCustomers = data.customers || [];
    if (data.minOpeningFloat !== undefined) {
      minOpeningFloat = Math.max(0, Number(data.minOpeningFloat || 0));
    }
    if (data.customDiscountThresholdPct !== undefined) {
      customDiscountThresholdPct = Math.max(0, Number(data.customDiscountThresholdPct || 10));
    }
    if (data.customDiscountThresholdAmt !== undefined) {
      customDiscountThresholdAmt = Math.max(0, Number(data.customDiscountThresholdAmt || 100));
    }
    if (data.arOverduePolicy) {
      arOverduePolicy = { ...arOverduePolicy, ...data.arOverduePolicy };
    }
    const hintEl = document.getElementById("custom-discount-threshold-hint");
    if (hintEl) {
      hintEl.textContent = `Discounts > ${customDiscountThresholdPct}% or > ₱${customDiscountThresholdAmt.toFixed(2)} require Supervisor Override.`;
    }
    const minNoteEl = document.getElementById("beg-cash-min-note");
    if (minNoteEl) {
      minNoteEl.textContent = `Minimum configured float: ₱${minOpeningFloat.toFixed(2)}`;
    }

    const resolvedTerminalName = data.selectedTerminal?.terminal_name || session.selectedTerminalName || "Counter 1";
    const termEl = document.getElementById("selected-terminal-name");
    if (termEl) {
      termEl.textContent = resolvedTerminalName;
      termEl.setAttribute("aria-readonly", "true");
    }
    const navTermEl = document.getElementById("cashier-nav-terminal");
    if (navTermEl) {
      navTermEl.textContent = resolvedTerminalName;
      navTermEl.setAttribute("aria-readonly", "true");
    }

    // Check shift status: only Cashier role is prompted for mandatory opening shift & beginning cash
    if (currentUser?.role_name === "Cashier") {
      await checkAndPromptShift();
    } else {
      // Non-cashier roles (Admin, Manager, Supervisor): display active shift if one exists, but NEVER auto-prompt modal
      try {
        const { data: shiftData } = await axios.get(apiUrl, {
          params: { operation: "getActiveShift" },
          withCredentials: true
        });
        if (shiftData.activeShift && shiftData.activeShift.shift_id) {
          currentShiftId = Number(shiftData.activeShift.shift_id);
          const floatAmt = shiftData.activeShift.current_float !== undefined && shiftData.activeShift.current_float !== null
            ? Number(shiftData.activeShift.current_float)
            : Number(shiftData.activeShift.opening_cash);
          updateShiftBadge(currentShiftId, floatAmt);
        } else {
          updateShiftBadge(null, 0);
        }
      } catch (e) {
        // Non-blocking
      }
    }

    if (Array.isArray(data.paymentMethods) && data.paymentMethods.length > 0) {
      availablePaymentMethods = [...data.paymentMethods];
      const cashIdx = availablePaymentMethods.findIndex(m => m.method_name && m.method_name.toLowerCase().includes("cash"));
      if (cashIdx > 0) {
        const cashItem = availablePaymentMethods.splice(cashIdx, 1)[0];
        availablePaymentMethods.unshift(cashItem);
      }
    } else {
      availablePaymentMethods = [
        { payment_method_id: 1, method_name: "Cash" },
        { payment_method_id: 2, method_name: "GCash" },
        { payment_method_id: 3, method_name: "Bank Transfer" }
      ];
    }
    selectPaymentMethodSilent(0);
    fillSelect("ar_customer_id", data.customers, "ar_customer_id", "customer_name", "-- SELECT CUSTOMER --");
    fillSelect(
      "suki_card_id",
      sukiCards,
      "sku_card_id",
      null,
      "-- UNREGISTERED / ENTER POINTS --",
      (card) => `${card.card_number} — ${arCustomers.find((c) => String(c.ar_customer_id) === String(card.ar_customer_id))?.customer_name || "Customer"} (${Number(card.points_balance || 0).toFixed(0)} pts)`
    );
    fillSelect(
      "product_id",
      products,
      "product_id",
      null,
      "-- SELECT PRODUCT --",
      (p) => `${p.product_id} — ${p.product_name} (₱${Number(p.price || 0).toFixed(2)})`
    );

    // If Cashier and register is closed, auto-open register only if shift is active
    if (currentUser?.role_name === "Cashier" && currentShiftId !== null) {
      startSale();
    }

    // Load active held transactions count
    await updateHeldTransactionsBadge();
  } catch (error) {
    console.error(error);
    showError("Unable to load sales options.");
  }
};

const fillSelect = (id, records, valueKey, labelKey, placeholder, formatter = (r) => r[labelKey]) => {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  (records || []).forEach((record) => {
    const option = document.createElement("option");
    option.value = record[valueKey];
    option.textContent = formatter(record);
    select.appendChild(option);
  });
  syncKeyboardDropdown(id);
};

const registerKeyboardDropdown = (selectId, buttonId, listboxId, settings = {}) => {
  const select = document.getElementById(selectId);
  const button = document.getElementById(buttonId);
  const listbox = document.getElementById(listboxId);
  if (!select || !button || !listbox) return;

  const dropdown = {
    select,
    button,
    listbox,
    highlightedIndex: -1,
    typeahead: "",
    typeaheadTimeout: null,
    focusScanOnClose: Boolean(settings.focusScanOnClose),
  };
  keyboardDropdowns.set(selectId, dropdown);
  button.addEventListener("click", () => {
    if (openKeyboardDropdown === dropdown) {
      closeKeyboardDropdown(dropdown, true);
    } else {
      openKeyboardDropdownList(dropdown);
    }
  });
  select.addEventListener("change", () => syncKeyboardDropdown(selectId));
  syncKeyboardDropdown(selectId);
};

const syncKeyboardDropdown = (selectId) => {
  const dropdown = keyboardDropdowns.get(selectId);
  if (!dropdown) return;
  const selectedOption = dropdown.select.selectedOptions[0];
  dropdown.button.textContent = selectedOption?.textContent || "No options available";
  dropdown.listbox.replaceChildren();

  Array.from(dropdown.select.options).forEach((option, index) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "pos-keyboard-select-option";
    optionButton.id = `${dropdown.listbox.id}-option-${index}`;
    optionButton.setAttribute("role", "option");
    optionButton.tabIndex = -1;
    optionButton.setAttribute("aria-selected", String(option.selected));
    optionButton.textContent = option.textContent;
    optionButton.dataset.search = `${option.textContent || ""} ${option.value}`.toLocaleLowerCase();
    optionButton.disabled = option.disabled || !option.value;
    optionButton.addEventListener("click", () => {
      dropdown.select.value = option.value;
      dropdown.select.dispatchEvent(new Event("change", { bubbles: true }));
      closeKeyboardDropdown(dropdown, true);
    });
    dropdown.listbox.appendChild(optionButton);
  });
};

const openKeyboardDropdownList = (dropdown) => {
  if (openKeyboardDropdown && openKeyboardDropdown !== dropdown) {
    closeKeyboardDropdown(openKeyboardDropdown, false);
  }
  const options = Array.from(dropdown.select.options);
  const selectableOptions = options.filter((option) => option.value !== "" && !option.disabled);
  if (!selectableOptions.length) return;

  openKeyboardDropdown = dropdown;
  const selectedIndex = selectableOptions.findIndex((option) => option.selected);
  dropdown.highlightedIndex = selectedIndex >= 0 ? selectedIndex : 0;
  dropdown.typeahead = "";
  clearTimeout(dropdown.typeaheadTimeout);
  dropdown.listbox.querySelectorAll('[role="option"]').forEach((option) => { option.hidden = false; });
  dropdown.listbox.classList.remove("d-none");
  dropdown.button.setAttribute("aria-expanded", "true");
  setSpatialFocus(dropdown.button);
  dropdown.button.focus();
  updateKeyboardDropdownHighlight(dropdown);
};

const getKeyboardDropdownOptions = (dropdown) =>
  Array.from(dropdown.listbox.querySelectorAll('[role="option"]:not(:disabled)'))
    .filter((option) => !option.hidden);

const updateKeyboardDropdownHighlight = (dropdown) => {
  dropdown.listbox.querySelectorAll('[role="option"]').forEach((option) => option.classList.remove("is-highlighted"));
  const options = getKeyboardDropdownOptions(dropdown);
  const highlighted = options[dropdown.highlightedIndex];
  if (highlighted) {
    highlighted.classList.add("is-highlighted");
    dropdown.button.setAttribute("aria-activedescendant", highlighted.id);
    highlighted.scrollIntoView({ block: "nearest" });
  } else {
    dropdown.button.removeAttribute("aria-activedescendant");
  }
};

const closeKeyboardDropdown = (dropdown, restoreFocus) => {
  clearTimeout(dropdown.typeaheadTimeout);
  dropdown.typeahead = "";
  dropdown.listbox.querySelectorAll('[role="option"]').forEach((option) => { option.hidden = false; });
  dropdown.listbox.classList.add("d-none");
  dropdown.button.setAttribute("aria-expanded", "false");
  dropdown.button.removeAttribute("aria-activedescendant");
  dropdown.listbox.querySelectorAll(".is-highlighted").forEach((option) => option.classList.remove("is-highlighted"));
  if (openKeyboardDropdown === dropdown) openKeyboardDropdown = null;
  if (restoreFocus) {
    if (dropdown.focusScanOnClose) focusBarcodeInput();
    else setSpatialFocus(dropdown.button);
  }
};

const handleKeyboardDropdownKey = (event) => {
  const dropdown = openKeyboardDropdown;
  if (!dropdown) return false;

  // Any key the open dropdown consumes must never reach the global dispatcher
  // (or any other listener): one keystroke = one action.
  const consume = () => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  if (event.key === "Escape") {
    consume();
    closeKeyboardDropdown(dropdown, true);
    return true;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    consume();
    const options = getKeyboardDropdownOptions(dropdown);
    if (options.length) {
      const direction = event.key === "ArrowDown" ? 1 : -1;
      dropdown.highlightedIndex = (dropdown.highlightedIndex + direction + options.length) % options.length;
      updateKeyboardDropdownHighlight(dropdown);
    }
    return true;
  }
  if (event.key === "End") {
    consume();
    const options = getKeyboardDropdownOptions(dropdown);
    if (options.length) {
      dropdown.highlightedIndex = options.length - 1;
      updateKeyboardDropdownHighlight(dropdown);
    }
    return true;
  }
  if (event.key === "Enter") {
    // Selecting an option is a NON-COMMITTING configuration step: set the value,
    // then close the list and restore the configured focus. Checkout is never started here.
    consume();
    const options = getKeyboardDropdownOptions(dropdown);
    const highlighted = options[dropdown.highlightedIndex];
    if (highlighted) highlighted.click(); // option click handler selects + closes + restores focus
    else closeKeyboardDropdown(dropdown, true);
    return true;
  }
  if (event.key === "F8" || event.key === "F9") {
    // FIX 4: If dropdown list is already open, F8/F9 closes list only without moving focus
    consume();
    closeKeyboardDropdown(dropdown, true);
    return true;
  }
  if (/^F(?:[1-7]|1[0-2])$/.test(event.key)) {
    closeKeyboardDropdown(dropdown, false);
    return false;
  }
  if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    consume();
    const options = Array.from(dropdown.listbox.querySelectorAll('[role="option"]:not(:disabled)'));
    let query = `${dropdown.typeahead}${event.key}`.toLocaleLowerCase();
    let matches = options.filter((option) => option.dataset.search.includes(query));
    if (!matches.length && dropdown.typeahead) {
      query = event.key.toLocaleLowerCase();
      matches = options.filter((option) => option.dataset.search.includes(query));
    }
    if (matches.length) {
      options.forEach((option) => { option.hidden = !matches.includes(option); });
      dropdown.typeahead = query;
      const visibleOptions = getKeyboardDropdownOptions(dropdown);
      dropdown.highlightedIndex = 0;
      updateKeyboardDropdownHighlight(dropdown);
      visibleOptions[0]?.scrollIntoView({ block: "nearest" });
    } else {
      options.forEach((option) => { option.hidden = false; });
      dropdown.typeahead = "";
      updateKeyboardDropdownHighlight(dropdown);
    }
    clearTimeout(dropdown.typeaheadTimeout);
    dropdown.typeaheadTimeout = setTimeout(() => { dropdown.typeahead = ""; }, 700);
    return true;
  }
  return false;
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

/* ==========================================================================
   Register Lifecycle
   ========================================================================== */
const startSale = () => {
  cart = [];
  activeCartIndex = -1;
  activeHeldId = null;
  activeHoldRef = null;
  document.getElementById("held-sale-status-badge")?.classList.add("d-none");
  document.getElementById("sale-form")?.reset();
  const taxRateInput = document.getElementById("tax_rate");
  if (taxRateInput) taxRateInput.value = 0;

  document.getElementById("sale-form-container")?.classList.remove("d-none");
  syncSukiToggleUI(false);
  const arSearchInputEl = document.getElementById("ar-customer-search-filter");
  if (arSearchInputEl) arSearchInputEl.value = "";
  updateSaleTypeFields();
  updateSukiFields();
  updateModeBadge();
  renderCart();
  focusBarcodeInput();
  showScanFeedback("Register ready. Scan or type product code.");
};

let preClearFocusElement = null;

const requestClearCart = () => {
  if (cart.length === 0) {
    showScanFeedback("Cart is already empty.");
    return;
  }
  preClearFocusElement = document.activeElement || document.getElementById("btn-cancel-sale");
  const modalEl = document.getElementById("clear-cart-confirm-modal");
  if (modalEl) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: "static", keyboard: false });
    modal.show();
  }
};

const cancelClearCart = () => {
  const modalEl = document.getElementById("clear-cart-confirm-modal");
  if (modalEl) {
    bootstrap.Modal.getInstance(modalEl)?.hide();
  }
  if (preClearFocusElement && document.body.contains(preClearFocusElement)) {
    setSpatialFocus(preClearFocusElement);
    preClearFocusElement.focus();
  } else {
    focusBarcodeInput();
  }
  showScanFeedback("Clear cart cancelled. Cart kept.");
};

const confirmClearCart = () => {
  const modalEl = document.getElementById("clear-cart-confirm-modal");
  if (modalEl) {
    bootstrap.Modal.getInstance(modalEl)?.hide();
  }
  closeSale();
  focusBarcodeInput();
};

const closeSale = () => {
  cart = [];
  activeCartIndex = -1;
  activeHeldId = null;
  activeHoldRef = null;
  document.getElementById("held-sale-status-badge")?.classList.add("d-none");
  setSaleMode(SALE_MODE.CASH);
  selectPaymentMethodSilent(0);
  const custSelect = document.getElementById("ar_customer_id");
  if (custSelect) {
    custSelect.value = "";
  }
  const arSearchResetEl = document.getElementById("ar-customer-search-filter");
  if (arSearchResetEl) arSearchResetEl.value = "";
  syncSukiToggleUI(false);
  const taxEl = document.getElementById("tax_rate");
  if (taxEl) taxEl.value = "12";
  const discTypeEl = document.getElementById("discount_type");
  if (discTypeEl) discTypeEl.value = "none";
  const discIdEl = document.getElementById("discount_id_number");
  if (discIdEl) discIdEl.value = "";
  const custDiscValEl = document.getElementById("custom_discount_value");
  if (custDiscValEl) custDiscValEl.value = "0";
  approvedDiscountSupervisorId = null;
  approvedDiscountSignature = "";
  if (typeof updateDiscountUI === "function") updateDiscountUI();
  renderCart();
  showScanFeedback("Register cleared.");
  focusBarcodeInput();
};

const focusBarcodeInput = () => {
  setTimeout(() => {
    const input = document.getElementById("barcode-input");
    if (input && !isAnyModalOpen()) {
      setSpatialFocus(input);
      input.focus();
      input.select();
    }
  }, 50);
};

const isAnyModalOpen = () => {
  if (document.querySelectorAll(".modal.show, .modal-backdrop").length > 0) return true;
  if (document.querySelector(".modal[style*='display: block']")) return true;
  if (typeof Swal !== "undefined" && Swal.isVisible()) return true;
  const arList = document.getElementById("ar-customer-typeahead-list");
  if (arList && !arList.classList.contains("d-none")) return true;
  return false;
};

let isDiscountPanelOpen = false;
const isDiscountPanelActive = () => {
  return false;
};

const showScanFeedback = (msg, isError = false) => {
  const fb = document.getElementById("scan-feedback");
  if (fb) {
    fb.textContent = msg;
    fb.className = `pos-scan-feedback ${isError ? "text-danger fw-bold" : "text-success fw-bold"}`;
  }
};

/* ==========================================================================
   Keyboard-First Scanning & Product Lookup
   ========================================================================== */
const focusQuantityInput = () => {
  const qtyInput = document.getElementById("quantity");
  if (qtyInput) {
    setSpatialFocus(qtyInput);
    qtyInput.focus();
    qtyInput.select();
  }
};

const handleBarcodeScan = () => {
  if (isAnyModalOpen() || isDiscountPanelActive()) return;
  const input = document.getElementById("barcode-input");
  const qtyInput = document.getElementById("quantity");
  if (!input) return;
  const rawQuery = input.value.trim();
  if (!rawQuery) return;

  const quantity = Number(qtyInput?.value || 1);
  const activeQty = quantity > 0 ? quantity : 1;

  // Search logic:
  // 1. Exact barcode match
  // 2. Exact name match (case-insensitive)
  // 3. Prefix match in product_name
  // 4. Substring match in product_name
  let matched = products.find((p) => p.barcode && String(p.barcode).trim() === rawQuery);

  if (!matched) {
    const lowerQuery = rawQuery.toLowerCase();
    matched = products.find((p) => p.product_name.toLowerCase() === lowerQuery);
  }

  if (!matched) {
    const lowerQuery = rawQuery.toLowerCase();
    matched = products.find((p) => p.product_name.toLowerCase().startsWith(lowerQuery));
  }

  if (!matched) {
    const lowerQuery = rawQuery.toLowerCase();
    matched = products.find((p) => p.product_name.toLowerCase().includes(lowerQuery));
  }

  if (matched) {
    addProductToCart(matched, activeQty);
    input.value = "";
    if (qtyInput) qtyInput.value = 1;
    showScanFeedback(`Added ${activeQty}x: ${matched.product_name} (₱${Number(matched.price).toFixed(2)})`);
  } else {
    showScanFeedback(`Item / Barcode "${rawQuery}" not found. Press F2 to lookup.`, true);
  }
  focusBarcodeInput();
};

const addItemFromDropdown = () => {
  const select = document.getElementById("product_id");
  const qtyInput = document.getElementById("quantity");

  const product = products.find((p) => String(p.product_id) === select?.value);
  const quantity = Number(qtyInput?.value || 1);

  if (!product || quantity <= 0) {
    showScanFeedback("Select a product and enter a valid quantity.", true);
    return;
  }
  addProductToCart(product, quantity);
  if (select) select.value = "";
  if (qtyInput) qtyInput.value = 1;
  focusBarcodeInput();
};

const addProductToCart = (product, quantity = 1) => {
  const qty = Number(quantity) > 0 ? Number(quantity) : 1;
  const existingIndex = cart.findIndex((item) => item.productId === Number(product.product_id));
  if (existingIndex >= 0) {
    cart[existingIndex].quantity += qty;
    cart[existingIndex].promoId = product.promo_id ? Number(product.promo_id) : (cart[existingIndex].promoId || null);
    cart[existingIndex].promoName = product.promo_name || cart[existingIndex].promoName || "";
    cart[existingIndex].promoRate = Number(product.promo_rate !== undefined ? product.promo_rate : (cart[existingIndex].promoRate || 0));
    activeCartIndex = existingIndex;
  } else {
    cart.push({
      productId: Number(product.product_id),
      barcode: product.barcode || "",
      productName: product.product_name,
      unitPrice: Number(product.price || 0),
      quantity: qty,
      promoId: product.promo_id ? Number(product.promo_id) : null,
      promoName: product.promo_name || "",
      promoRate: Number(product.promo_rate || 0),
    });
    activeCartIndex = cart.length - 1;
  }
  renderCart();
  focusBarcodeInput();
};

/* ==========================================================================
   Product Search Modal [F2]
   ========================================================================== */
const openProductSearchModal = () => {
  const modalEl = document.getElementById("product-search-modal");
  if (!modalEl) return;
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  const queryInput = document.getElementById("product-search-query");
  searchResultIndex = -1;
  if (queryInput) {
    queryInput.value = "";
    setTimeout(() => queryInput.focus(), 150);
  }
  renderProductSearchResults(products);
};

const filterProductSearchResults = () => {
  const query = (document.getElementById("product-search-query")?.value || "").toLowerCase().trim();
  searchResultIndex = 0;
  if (!query) {
    renderProductSearchResults(products);
    return;
  }
  const barcodeMatches = products.filter((p) => p.barcode && p.barcode.toLowerCase().includes(query));
  const exactNameMatches = products.filter((p) => p.product_name.toLowerCase() === query);
  const prefixNameMatches = products.filter((p) => p.product_name.toLowerCase().startsWith(query) && p.product_name.toLowerCase() !== query);
  const substrNameMatches = products.filter((p) => !p.product_name.toLowerCase().startsWith(query) && p.product_name.toLowerCase().includes(query));

  const combined = Array.from(new Set([...barcodeMatches, ...exactNameMatches, ...prefixNameMatches, ...substrNameMatches]));
  renderProductSearchResults(combined);
};

const renderProductSearchResults = (items) => {
  const tbody = document.getElementById("product-search-results");
  if (!tbody) return;
  currentSearchResults = items.slice(0, 30);

  if (!currentSearchResults.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No matching products found.</td></tr>';
    searchResultIndex = -1;
    return;
  }

  if (searchResultIndex < 0 || searchResultIndex >= currentSearchResults.length) {
    searchResultIndex = 0;
  }

  tbody.innerHTML = currentSearchResults
    .map((p, idx) => {
      const isSelected = idx === searchResultIndex;
      const barcodeDisplay = p.barcode || `0000000${p.product_id}`.slice(-8);
      return `
        <tr class="${isSelected ? "table-active pos-row-selected" : ""}" data-result-index="${idx}">
          <td class="font-monospace fw-bold text-primary">${escapeHtml(barcodeDisplay)}</td>
          <td class="fw-semibold">${escapeHtml(p.product_name)}</td>
          <td class="text-end font-monospace">₱${Number(p.price).toFixed(2)}</td>
          <td class="text-center">
            <button type="button" class="btn btn-sm btn-primary py-0 px-2 select-product-btn" data-index="${idx}">
              Add [Enter]
            </button>
          </td>
        </tr>`;
    })
    .join("");

  const activeRow = tbody.querySelector(`tr[data-result-index="${searchResultIndex}"]`);
  activeRow?.scrollIntoView({ block: "nearest" });

  tbody.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => {
      const idx = Number(row.dataset.resultIndex);
      selectSearchedProduct(idx);
    });
  });
};

const selectSearchedProduct = (index) => {
  const product = currentSearchResults[index];
  if (!product) return;
  const qtyInput = document.getElementById("quantity");
  const qty = Number(qtyInput?.value || 1);
  const activeQty = qty > 0 ? qty : 1;

  addProductToCart(product, activeQty);
  if (qtyInput) qtyInput.value = 1;
  showScanFeedback(`Added ${activeQty}x ${product.product_name} (₱${Number(product.price).toFixed(2)} each)`);

  bootstrap.Modal.getInstance(document.getElementById("product-search-modal"))?.hide();
  focusBarcodeInput();
};

/* ==========================================================================
   Quantity Modifier Modal [F3]
   ========================================================================== */
const openQuantityModal = () => {
  if (!cart.length) {
    showScanFeedback("Cart is empty. Scan an item first.", true);
    return;
  }
  const targetIndex = activeCartIndex >= 0 && activeCartIndex < cart.length ? activeCartIndex : cart.length - 1;
  const item = cart[targetIndex];
  if (!item) return;

  const modalEl = document.getElementById("quantity-modal");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

  const nameEl = document.getElementById("qty-modal-item-name");
  const inputEl = document.getElementById("qty-override-input");
  if (nameEl) nameEl.textContent = `${item.productName} (Current: ${item.quantity})`;
  if (inputEl) {
    inputEl.value = item.quantity;
    modal.show();
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 150);
  }
};

const confirmQuantityOverride = async () => {
  const inputEl = document.getElementById("qty-override-input");
  const newQty = Number(inputEl?.value || 0);
  if (newQty <= 0) {
    showError("Quantity must be greater than zero.");
    return;
  }
  const targetIndex = activeCartIndex >= 0 && activeCartIndex < cart.length ? activeCartIndex : cart.length - 1;
  const item = cart[targetIndex];
  if (!item) return;

  if (newQty === item.quantity) {
    bootstrap.Modal.getInstance(document.getElementById("quantity-modal"))?.hide();
    focusBarcodeInput();
    return;
  }

  bootstrap.Modal.getInstance(document.getElementById("quantity-modal"))?.hide();

  try {
    const auth = await requestSupervisorAuth(
      "change_cart_quantity",
      `${item.productName}: Qty ${item.quantity} -> ${newQty}`
    );
    item.quantity = newQty;
    renderCart();
    showScanFeedback(`Updated ${item.productName} qty to ${newQty} (Authorized by ${auth.supervisor?.name || "Supervisor"}).`);
  } catch (err) {
    if (err.message && err.message !== "Cancelled") {
      showError(err.message);
    }
  }
  focusBarcodeInput();
};

/* ==========================================================================
   Void Line Item [F4] & Void Transaction [F5] (Protected by Supervisor)
   ========================================================================== */
const voidActiveItem = async () => {
  if (!cart.length) {
    showScanFeedback("Cart is empty. Nothing to void.", true);
    return;
  }
  const targetIndex = activeCartIndex >= 0 && activeCartIndex < cart.length ? activeCartIndex : cart.length - 1;
  const item = cart[targetIndex];
  if (!item) return;

  try {
    const auth = await requestSupervisorAuth(
      "void_item",
      `${item.productName} (Qty: ${item.quantity}, Price: ₱${item.unitPrice})`
    );
    const removed = cart.splice(targetIndex, 1)[0];
    activeCartIndex = Math.max(0, cart.length - 1);
    renderCart();
    showScanFeedback(`Voided item: ${removed?.productName} (Authorized by ${auth.supervisor?.name || "Supervisor"}).`);
  } catch (err) {
    if (err.message && err.message !== "Cancelled") {
      showError(err.message);
    }
  }
  focusBarcodeInput();
};

const requestVoidTransaction = async () => {
  if (!cart.length) {
    showScanFeedback("Cart is already empty.");
    return;
  }
  const grandTotal = document.getElementById("pos-grand-total")?.textContent || "PHP 0.00";
  try {
    const auth = await requestSupervisorAuth(
      "void_transaction",
      `Cart Total: ${grandTotal} (${cart.length} line items)`
    );
    closeSale();
    showScanFeedback(`Transaction voided (Authorized by ${auth.supervisor?.name || "Supervisor"}).`);
  } catch (err) {
    if (err.message && err.message !== "Cancelled") {
      showError(err.message);
    }
  }
  focusBarcodeInput();
};

/* ==========================================================================
   Cart Rendering & Math Engine
   ========================================================================== */
const computeDiscountAndTaxSummary = (grossAfterPromo) => {
  const discountType = (document.getElementById("discount_type")?.value || "none").toLowerCase();
  const customMode = (document.getElementById("custom_discount_mode")?.value || "percent").toLowerCase();
  const customVal = Math.max(0, Number(document.getElementById("custom_discount_value")?.value || 0));

  let vatableSales = 0.0;
  let vatExemptSales = 0.0;
  let vatExemptAmount = 0.0;
  let tax = 0.0;
  let discountTotal = 0.0;
  let grandTotal = grossAfterPromo;
  let discountLabel = "Less Discount:";

  if (discountType === "senior" || discountType === "pwd") {
    // RA 9994 (Senior Citizen) & RA 10754 (PWD): 12% VAT-Exempt + 20% Statutory Discount
    vatExemptSales = Math.round((grossAfterPromo / 1.12) * 100) / 100;
    vatExemptAmount = Math.round((grossAfterPromo - vatExemptSales) * 100) / 100;
    discountTotal = Math.round(vatExemptSales * 0.20 * 100) / 100;
    grandTotal = Math.round((vatExemptSales - discountTotal) * 100) / 100;
    vatableSales = 0.0;
    tax = 0.0;
    discountLabel = discountType === "senior" ? "Less 20% SC Discount (RA 9994):" : "Less 20% PWD Discount (RA 10754):";
  } else if (discountType === "custom" && customVal > 0) {
    if (customMode === "percent") {
      const cappedPct = Math.min(100, Math.round(customVal * 100) / 100);
      discountTotal = Math.round(grossAfterPromo * (cappedPct / 100) * 100) / 100;
      discountLabel = `Less Custom Discount (${cappedPct}%):`;
    } else {
      discountTotal = Math.min(grossAfterPromo, Math.round(customVal * 100) / 100);
      discountLabel = "Less Custom Discount (Fixed):";
    }
    grandTotal = Math.max(0, Math.round((grossAfterPromo - discountTotal) * 100) / 100);
    vatableSales = Math.round((grandTotal / 1.12) * 100) / 100;
    tax = Math.round((grandTotal - vatableSales) * 100) / 100;
  } else {
    grandTotal = grossAfterPromo;
    vatableSales = Math.round((grandTotal / 1.12) * 100) / 100;
    tax = Math.round((grandTotal - vatableSales) * 100) / 100;
  }

  return {
    discountType,
    customMode,
    customVal,
    vatableSales,
    vatExemptSales,
    vatExemptAmount,
    tax,
    discountTotal,
    grandTotal,
    discountLabel
  };
};

const renderTotalsBreakdownDOM = (roundedPromoSavings, summary) => {
  const promoSavingsEl = document.getElementById("pos-promo-savings");
  const subtotalEl = document.getElementById("subtotal");
  const vatExemptSalesRow = document.getElementById("vat-exempt-sales-row");
  const vatExemptSalesEl = document.getElementById("vat-exempt-sales");
  const taxEl = document.getElementById("tax-total");
  const vatExemptAmtRow = document.getElementById("vat-exempt-amount-row");
  const vatExemptAmtEl = document.getElementById("vat-exempt-amount");
  const discRow = document.getElementById("discount-total-row");
  const discLabelEl = document.getElementById("discount-total-label");
  const discValEl = document.getElementById("discount-total-display");
  const totalHidden = document.getElementById("total-amount");
  const grandTotalEl = document.getElementById("pos-grand-total");

  const isStatutory = summary.discountType === "senior" || summary.discountType === "pwd";

  if (promoSavingsEl) promoSavingsEl.textContent = roundedPromoSavings > 0 ? `-₱${roundedPromoSavings.toFixed(2)}` : "0.00";
  if (subtotalEl) subtotalEl.textContent = summary.vatableSales.toFixed(2);
  if (vatExemptSalesRow) vatExemptSalesRow.classList.toggle("d-none", !isStatutory);
  if (vatExemptSalesEl) vatExemptSalesEl.textContent = summary.vatExemptSales.toFixed(2);
  if (taxEl) taxEl.textContent = summary.tax.toFixed(2);
  if (vatExemptAmtRow) vatExemptAmtRow.classList.toggle("d-none", !isStatutory);
  if (vatExemptAmtEl) vatExemptAmtEl.textContent = `-₱${summary.vatExemptAmount.toFixed(2)}`;
  if (discRow) discRow.classList.toggle("d-none", summary.discountType === "none");
  if (discLabelEl) discLabelEl.textContent = summary.discountLabel;
  if (discValEl) discValEl.textContent = `-₱${summary.discountTotal.toFixed(2)}`;
  if (totalHidden) totalHidden.value = summary.grandTotal.toFixed(2);
  if (grandTotalEl) grandTotalEl.textContent = `PHP ${summary.grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const updateDiscountUI = () => {
  const dt = (document.getElementById("discount_type")?.value || "none").toLowerCase();
  const idNum = (document.getElementById("discount_id_number")?.value || "").trim();
  const displayStatus = document.getElementById("discount-display-status");
  const supBadge = document.getElementById("discount-supervisor-badge");

  if (displayStatus) {
    if (dt === "senior") {
      displayStatus.textContent = `Senior Citizen (20%) • ${idNum}`;
    } else if (dt === "pwd") {
      displayStatus.textContent = `PWD (20%) • ${idNum}`;
    } else {
      displayStatus.textContent = "None (Press Enter)";
    }
  }
  if (supBadge) {
    supBadge.classList.add("d-none");
  }
  renderCart();
};

const applyCustomDiscountWithGate = async () => {
  const dt = (document.getElementById("discount_type")?.value || "none").toLowerCase();
  if (dt !== "custom") {
    isDiscountPanelOpen = false;
    return true;
  }
  const customMode = (document.getElementById("custom_discount_mode")?.value || "percent").toLowerCase();
  const customVal = Math.max(0, Number(document.getElementById("custom_discount_value")?.value || 0));
  if (customVal <= 0) {
    isDiscountPanelOpen = false;
    showScanFeedback("Custom discount set to 0.");
    focusBarcodeInput();
    return true;
  }
  let grossSubtotal = 0;
  let totalPromoSavings = 0;
  cart.forEach((item) => {
    const grossLine = Math.round(item.quantity * item.unitPrice * 100) / 100;
    const promoDisc = item.promoRate > 0 ? Math.round(((grossLine * item.promoRate) / 100) * 100) / 100 : 0;
    grossSubtotal += grossLine;
    totalPromoSavings += promoDisc;
  });
  const grossAfterPromo = Math.round((grossSubtotal - Math.round(totalPromoSavings * 100) / 100) * 100) / 100;
  const computedDisc = customMode === "percent"
    ? Math.round(grossAfterPromo * (Math.min(100, customVal) / 100) * 100) / 100
    : Math.min(grossAfterPromo, Math.round(customVal * 100) / 100);

  const exceedsThreshold = (customMode === "percent" && customVal > customDiscountThresholdPct) || (computedDisc > customDiscountThresholdAmt);
  const sig = `${customMode}:${customVal}`;

  if (exceedsThreshold && currentUser?.role_name === "Cashier" && approvedDiscountSignature !== sig) {
    try {
      const supRes = await requestSupervisorAuth(
        "custom_discount_override",
        `Custom Discount ${customMode === "percent" ? customVal + "%" : "PHP " + customVal.toFixed(2)}`
      );
      approvedDiscountSupervisorId = Number(supRes?.supervisor_id || 5);
      approvedDiscountSignature = sig;
      document.getElementById("discount-supervisor-badge")?.classList.remove("d-none");
      isDiscountPanelOpen = false;
      renderCart();
      showScanFeedback("Supervisor authorized custom discount.");
      focusBarcodeInput();
      return true;
    } catch (err) {
      approvedDiscountSupervisorId = null;
      approvedDiscountSignature = "";
      document.getElementById("custom_discount_value").value = "0";
      document.getElementById("discount-supervisor-badge")?.classList.add("d-none");
      isDiscountPanelOpen = false;
      renderCart();
      showScanFeedback("Custom discount above threshold requires Supervisor Override.", true);
      focusBarcodeInput();
      return false;
    }
  }
  isDiscountPanelOpen = false;
  renderCart();
  showScanFeedback("Custom discount applied.");
  focusBarcodeInput();
  return true;
};

const updateCartTotalsOnly = () => {
  let grossSubtotal = 0;
  let totalPromoSavings = 0;

  cart.forEach((item, index) => {
    const grossLine = Math.round(item.quantity * item.unitPrice * 100) / 100;
    const promoDisc = item.promoRate > 0 ? Math.round(((grossLine * item.promoRate) / 100) * 100) / 100 : 0;
    const lineTotal = Math.round((grossLine - promoDisc) * 100) / 100;
    grossSubtotal += grossLine;
    totalPromoSavings += promoDisc;

    const promoEl = document.querySelector(`[data-row-index="${index}"] .row-promo-discount`);
    const lineTotalEl = document.querySelector(`[data-row-index="${index}"] .row-line-total`);
    if (promoEl) promoEl.textContent = promoDisc > 0 ? `-₱${promoDisc.toFixed(2)}` : "-";
    if (lineTotalEl) lineTotalEl.textContent = `₱${lineTotal.toFixed(2)}`;
  });

  const roundedPromoSavings = Math.round(totalPromoSavings * 100) / 100;
  const grossAfterPromo = Math.round((grossSubtotal - roundedPromoSavings) * 100) / 100;
  const summary = computeDiscountAndTaxSummary(grossAfterPromo);
  renderTotalsBreakdownDOM(roundedPromoSavings, summary);
  updateCreditEligibility();
};

const renderCart = () => {
  let grossSubtotal = 0;
  let totalPromoSavings = 0;

  cart.forEach((item) => {
    const grossLine = Math.round(item.quantity * item.unitPrice * 100) / 100;
    const promoDisc = item.promoRate > 0 ? Math.round(((grossLine * item.promoRate) / 100) * 100) / 100 : 0;
    grossSubtotal += grossLine;
    totalPromoSavings += promoDisc;
  });

  const roundedPromoSavings = Math.round(totalPromoSavings * 100) / 100;
  const grossAfterPromo = Math.round((grossSubtotal - roundedPromoSavings) * 100) / 100;
  const summary = computeDiscountAndTaxSummary(grossAfterPromo);
  renderTotalsBreakdownDOM(roundedPromoSavings, summary);

  // Render Table
  const tableContainer = document.getElementById("cart-table");
  if (tableContainer) {
    if (!cart.length) {
      tableContainer.innerHTML = '<div class="p-4 text-center text-muted">Register is empty. Scan an item or press F1 to search.</div>';
    } else {
      tableContainer.innerHTML = `
        <table class="table pos-cart-table table-hover table-sm">
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th>Product Description</th>
              <th class="text-center" style="width: 14%;">Qty</th>
              <th class="text-end" style="width: 16%;">Price</th>
              <th class="text-end" style="width: 16%;">Promo</th>
              <th class="text-end" style="width: 18%;">Total</th>
              <th class="text-center" style="width: 8%;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${cart
          .map((item, index) => {
            const grossLine = Math.round(item.quantity * item.unitPrice * 100) / 100;
            const promoDisc = item.promoRate > 0 ? Math.round(((grossLine * item.promoRate) / 100) * 100) / 100 : 0;
            const lineTotal = Math.round((grossLine - promoDisc) * 100) / 100;
            const isActive = index === activeCartIndex;
            const promoText = promoDisc > 0 ? `-₱${promoDisc.toFixed(2)}` : "-";
            const promoBadge = promoDisc > 0 ? `<br><small class="text-success fw-semibold font-monospace">${escapeHtml(item.promoName || "Promo")} (${item.promoRate}% off)</small>` : "";
            return `
                  <tr class="${isActive ? "table-active pos-row-selected" : ""}" data-row-index="${index}">
                    <td class="num-cell text-muted">${index + 1}</td>
                    <td class="fw-semibold">
                      ${escapeHtml(item.productName)}${promoBadge}
                    </td>
                    <td class="text-center num-cell">
                      <span class="fw-bold font-monospace fs-6">${item.quantity}</span>
                    </td>
                    <td class="text-end num-cell">₱${item.unitPrice.toFixed(2)}</td>
                    <td class="text-end num-cell text-success font-monospace row-promo-discount">${promoText}</td>
                    <td class="text-end num-cell fw-bold row-line-total">₱${lineTotal.toFixed(2)}</td>
                    <td class="text-center">
                      <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 remove-item-btn" data-index="${index}" title="Void item [F4] (Supervisor Override)" tabindex="-1">
                        &times;
                      </button>
                    </td>
                  </tr>`;
          })
          .join("")}
          </tbody>
        </table>`;

      const activeCartRow = tableContainer.querySelector(`tr[data-row-index="${activeCartIndex}"]`);
      activeCartRow?.scrollIntoView({ block: "nearest" });

      // Row Selection Click
      tableContainer.querySelectorAll("tbody tr").forEach((row) => {
        row.addEventListener("click", (e) => {
          if (!e.target.closest(".remove-item-btn")) {
            activeCartIndex = Number(row.dataset.rowIndex);
            renderCart();
          }
        });
      });

      // Individual Remove Button -> Triggers Supervisor Override
      tableContainer.querySelectorAll(".remove-item-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          activeCartIndex = Number(btn.dataset.index);
          renderCart();
          voidActiveItem();
        });
      });

      // Inline Quantity Input Handlers (Task 6)
      tableContainer.querySelectorAll(".cart-qty-input").forEach((input) => {
        const idx = Number(input.dataset.index);
        input.addEventListener("click", (e) => e.stopPropagation());
        input.addEventListener("input", (e) => {
          const val = Number(e.target.value);
          if (val > 0) {
            cart[idx].quantity = val;
            updateCartTotalsOnly();
          }
        });
        input.addEventListener("change", (e) => {
          const val = Number(e.target.value);
          if (!val || val <= 0) {
            e.target.value = 1;
            cart[idx].quantity = 1;
          } else {
            cart[idx].quantity = val;
          }
          renderCart();
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            renderCart();
            focusBarcodeInput();
          }
        });
      });
    }
  }

  updateCreditEligibility();
};

/* ==========================================================================
   Checkout / Tender [F12] and AR Credit [F8] Actions
   ========================================================================== */
const triggerCashCheckout = () => {
  if (currentSaleMode !== SALE_MODE.CASH || isOpeningTenderModal || isAnyModalOpen()) {
    return;
  }
  if (!cart.length) {
    showScanFeedback("Cannot tender an empty cart. Scan items first.", true);
    return;
  }
  if (!document.getElementById("sale_payment_method_id")?.value) {
    const dropdown = keyboardDropdowns.get("sale_payment_method_id");
    showScanFeedback("Select a payment method before checkout.", true);
    const alert = showError("Select a payment method before checkout.", "Error", { returnFocus: false });
    const refocus = () => dropdown && setSpatialFocus(dropdown.button);
    if (alert?.then) alert.then(refocus); else refocus();
    return;
  }
  isOpeningTenderModal = true;
  clearTimeout(tenderOpenLockTimeout);
  tenderOpenLockTimeout = setTimeout(releaseTenderOpenLock, 1000);
  openTenderModal();
};

const releaseTenderOpenLock = () => {
  isOpeningTenderModal = false;
  clearTimeout(tenderOpenLockTimeout);
  tenderOpenLockTimeout = null;
};

const triggerArCreditSale = () => {
  if (!cart.length) {
    showScanFeedback("Cannot tender an empty cart. Scan items first.", true);
    return;
  }
  openTenderModal();
};

const openArCustomerFlow = () => {
  if (isAnyModalOpen()) return;
  setSaleMode(SALE_MODE.AR);
  closeArCustomerTypeahead();
  const searchInput = document.getElementById("ar-customer-search-filter");
  if (searchInput) {
    setSpatialFocus(searchInput);
    searchInput.focus();
    searchInput.select();
    showScanFeedback("AR Credit Mode (F8): Type customer name or contact to search.");
    return;
  }
  showError("Unable to open the AR customer picker.");
};

const triggerActiveCheckout = () => {
  if (!cart.length) {
    showScanFeedback("Cannot tender an empty cart. Scan items first.", true);
    return;
  }
  const isAr = currentSaleMode === SALE_MODE.AR;
  if (isAr) {
    triggerArCreditSale();
  } else {
    triggerCashCheckout();
  }
};

const cycleRegisterLogicalZone = (direction) => {
  currentLogicalZone = currentLogicalZone + direction;
  if (currentLogicalZone > 3) currentLogicalZone = 1;
  if (currentLogicalZone < 1) currentLogicalZone = 3;

  if (currentLogicalZone === 1) {
    const scanInput = document.getElementById("barcode-input");
    if (scanInput) {
      scanInput.focus();
      scanInput.select();
    }
    showScanFeedback("Zone 1: Barcode Scanner");
  } else if (currentLogicalZone === 2) {
    const cartWrapper = document.getElementById("cart-table");
    if (cartWrapper) {
      cartWrapper.focus();
    }
    if (cart.length > 0) {
      if (activeCartIndex < 0) activeCartIndex = 0;
      renderCart();
      showScanFeedback(`Zone 2: Cart Lines (${cart.length} items, use ↑/↓ to navigate)`);
    } else {
      showScanFeedback("Zone 2: Cart (Empty)");
    }
  } else if (currentLogicalZone === 3) {
    const tenderBtn = document.getElementById("btn-open-tender");
    if (tenderBtn) {
      tenderBtn.focus();
    }
    showScanFeedback("Zone 3: Checkout Actions [F9 Cash Mode / F8 AR Credit / F12 Checkout / Tender]");
  }
};

/* ==========================================================================
   Tender Modal & Live Sukli (Change) Calculator
   ========================================================================== */
const openTenderModal = async () => {
  if (!cart.length) {
    showError("Add at least one product before proceeding to tender.");
    focusBarcodeInput();
    return;
  }

  const discountType = (document.getElementById("discount_type")?.value || "none").toLowerCase();
  if (discountType === "senior" || discountType === "pwd") {
    const idNum = (document.getElementById("discount_id_number")?.value || "").trim();
    if (!idNum) {
      const label = discountType === "senior" ? "Senior Citizen (OSCA)" : "PWD";
      const alert = showError(`Please enter the customer's ${label} ID number before proceeding to tender (BIR requirement).`, "ID Number Required", { returnFocus: false });
      const focusId = () => {
        const idEl = document.getElementById("discount_id_number");
        if (idEl) setSpatialFocus(idEl);
      };
      if (alert?.then) alert.then(focusId);
      else focusId();
      return;
    }
  } else if (discountType === "custom") {
    const ok = await applyCustomDiscountWithGate();
    if (!ok) return;
  }

  const isAr = currentSaleMode === SALE_MODE.AR;
  const grandTotal = Number(document.getElementById("total-amount")?.value || 0);
  const paymentMethod = document.getElementById("payment-method-name")?.textContent.trim() || "";
  const requiresCustomer = isAr || /^ar\s*credit\b/i.test(paymentMethod);

  if (requiresCustomer) {
    const customerSelect = document.getElementById("ar_customer_id");
    if (!customerSelect?.value) {
      const message = "AR Credit sale requires a registered customer";
      const alert = showError(message, "Error", { returnFocus: false });
      const restoreFocus = () => {
        const modeControl = document.getElementById("btn-mode-ar");
        if (modeControl) setSpatialFocus(modeControl);
      };
      if (alert?.then) alert.then(restoreFocus);
      else restoreFocus();
      return;
    }
  }

  if (isAr) {
    const creditCheck = updateCreditEligibility();
    if (!creditCheck?.eligible) {
      if (creditCheck?.blockedByOverdue) {
        showError(
          `AR Account Blocked: Customer has ${creditCheck.overdueCount} overdue invoice(s) totaling ₱${Number(creditCheck.overdueBalance || 0).toFixed(2)}. Settle overdue balances before charging new AR sales.`,
          "Overdue Account Blocked"
        );
      } else {
        showError("This customer does not have enough available credit for this sale.");
      }
      return;
    }
  }

  // Display Grand Total in Modal
  const modalTotalEl = document.getElementById("tender-modal-total");
  if (modalTotalEl) {
    modalTotalEl.textContent = `PHP ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Reset Presets visual highlight
  activePresetIndex = -1;
  document.querySelectorAll(".pos-quick-cash-btn").forEach((btn) => {
    btn.classList.remove("btn-primary", "text-white");
    btn.classList.add("btn-outline-secondary");
  });

  // Toggle AR vs Cash section
  const cashSec = document.getElementById("tender-cash-section");
  const arSec = document.getElementById("tender-ar-section");
  const tenderCashInput = document.getElementById("tender-cash-input");
  const submitBtn = document.getElementById("btn-submit-tender");

  if (cashSec) cashSec.classList.toggle("d-none", isAr);
  if (arSec) arSec.classList.toggle("d-none", !isAr);

  if (isAr) {
    const custSelect = document.getElementById("ar_customer_id");
    const customer = arCustomers.find((c) => String(c.ar_customer_id) === custSelect?.value);
    const balance = Number(customer?.current_balance || 0);
    const limit = Number(customer?.credit_limit || 0);
    const availBefore = Math.max(0, limit - balance);
    const remainAfter = Math.max(0, availBefore - grandTotal);

    if (arSec) {
      arSec.innerHTML = `
        <div class="card p-3 bg-light border shadow-sm">
          <div class="d-flex justify-content-between mb-2">
            <span class="text-muted fw-semibold">AR Customer:</span>
            <strong class="text-dark">${escapeHtml(customer?.customer_name || "Customer")}</strong>
          </div>
          <div class="d-flex justify-content-between mb-2">
            <span class="text-muted">Credit Limit:</span>
            <span class="font-monospace fw-bold">₱${limit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="d-flex justify-content-between mb-2">
            <span class="text-muted">Current Balance:</span>
            <span class="font-monospace text-danger fw-bold">₱${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="d-flex justify-content-between mb-2">
            <span class="text-muted">Available Credit (Before):</span>
            <span class="font-monospace text-success fw-bold">₱${availBefore.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
          <hr class="my-2" />
          <div class="d-flex justify-content-between">
            <span class="fw-bold">Available Credit (After Sale):</span>
            <span class="font-monospace text-primary fw-bold fs-6">₱${remainAfter.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      `;
    }
    if (submitBtn) {
      submitBtn.textContent = "CONFIRM AR CREDIT SALE [Enter / F12]";
      submitBtn.disabled = false;
    }
  } else {
    if (tenderCashInput) {
      tenderCashInput.value = "";
      updateSukliCalculator();
    }
    if (submitBtn) {
      submitBtn.textContent = "COMPLETE SALE [Enter / F12]";
    }
  }

  const modalEl = document.getElementById("tender-modal");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  if (!isAr && tenderCashInput) {
    setTimeout(() => {
      tenderCashInput.focus();
      tenderCashInput.select();
    }, 150);
  } else if (isAr && submitBtn) {
    setTimeout(() => {
      submitBtn.focus();
    }, 150);
  }
};

const updateSukliCalculator = () => {
  const isAr = currentSaleMode === SALE_MODE.AR;
  if (isAr) return;

  const grandTotal = Number(document.getElementById("total-amount")?.value || 0);
  const tenderCashInput = document.getElementById("tender-cash-input");
  const tendered = Number(tenderCashInput?.value || 0);
  const sukliAmountEl = document.getElementById("tender-sukli-amount");
  const sukliBox = document.getElementById("tender-sukli-box");
  const submitBtn = document.getElementById("btn-submit-tender");

  if (tendered >= grandTotal && grandTotal > 0) {
    const change = Math.round((tendered - grandTotal) * 100) / 100;
    if (sukliAmountEl) {
      sukliAmountEl.textContent = `PHP ${change.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      sukliAmountEl.className = "pos-sukli-amount";
    }
    if (sukliBox) {
      sukliBox.className = "pos-sukli-box sufficient";
    }
    if (submitBtn) submitBtn.disabled = false;
  } else if (tendered === 0 && grandTotal === 0) {
    if (sukliAmountEl) sukliAmountEl.textContent = "PHP 0.00";
    if (submitBtn) submitBtn.disabled = false;
  } else {
    if (sukliAmountEl) {
      const short = (grandTotal - tendered).toFixed(2);
      sukliAmountEl.textContent = `Short: -₱${short}`;
      sukliAmountEl.className = "pos-sukli-amount insufficient";
    }
    if (sukliBox) {
      sukliBox.className = "pos-sukli-box insufficient";
    }
    if (submitBtn) submitBtn.disabled = true;
  }
};

const cycleQuickCashPreset = (direction) => {
  const isAr = currentSaleMode === SALE_MODE.AR;
  if (isAr) return;

  if (activePresetIndex === -1) {
    activePresetIndex = direction > 0 ? 0 : quickCashPresets.length - 1;
  } else {
    activePresetIndex = (activePresetIndex + direction + quickCashPresets.length) % quickCashPresets.length;
  }

  const preset = quickCashPresets[activePresetIndex];
  handleQuickCashPreset(preset);
};

const handleQuickCashPreset = (preset) => {
  const grandTotal = Number(document.getElementById("total-amount")?.value || 0);
  const tenderCashInput = document.getElementById("tender-cash-input");
  if (!tenderCashInput) return;

  activePresetIndex = quickCashPresets.indexOf(preset);

  if (preset === "exact") {
    tenderCashInput.value = grandTotal.toFixed(2);
  } else {
    tenderCashInput.value = Number(preset).toFixed(2);
  }
  updateSukliCalculator();
  tenderCashInput.focus();

  document.querySelectorAll(".pos-quick-cash-btn").forEach((btn) => {
    const isThisPreset = btn.dataset.preset === preset;
    btn.classList.toggle("btn-primary", isThisPreset);
    btn.classList.toggle("text-white", isThisPreset);
    btn.classList.toggle("btn-outline-secondary", !isThisPreset);
  });
};

/* ==========================================================================
   Checkout Execution with Double-Submission Guard
   ========================================================================== */
const executeCheckout = async () => {
  if (isSubmitting) return;

  if (!cart.length) {
    showError("Add at least one product.");
    return;
  }

  const isAr = currentSaleMode === SALE_MODE.AR;
  const grandTotal = Number(document.getElementById("total-amount")?.value || 0);

  if (!isAr) {
    const tendered = Number(document.getElementById("tender-cash-input")?.value || 0);
    if (tendered < grandTotal && grandTotal > 0) {
      showError("Cash tendered is less than the total amount due.");
      document.getElementById("tender-cash-input")?.focus();
      return;
    }
  } else {
    if (!(await refreshCreditEligibility())) {
      showError("Unable to verify this customer's credit eligibility.");
      return;
    }
    const creditCheck = updateCreditEligibility();
    if (!creditCheck?.eligible) {
      showError("Customer credit limit exceeded.");
      return;
    }
  }

  // Frontend Submission Lock
  isSubmitting = true;
  const submitBtn = document.getElementById("btn-submit-tender");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing Transaction...";
  }

  const data = {
    heldId: activeHeldId,
    saleType: currentSaleMode,
    paymentMethodId: currentSaleMode === SALE_MODE.AR ? "" : document.getElementById("sale_payment_method_id")?.value,
    taxRate: document.getElementById("tax_rate")?.value,
    customerId: currentSaleMode === SALE_MODE.AR ? document.getElementById("ar_customer_id")?.value : null,
    sukiCardStatus: document.getElementById("suki_card_status")?.value,
    sukiCardId: document.getElementById("suki_card_id")?.value,
    sukiPointsBalance: document.getElementById("suki_points_balance")?.value,
    discountType: document.getElementById("discount_type")?.value || "none",
    discountIdNumber: (document.getElementById("discount_id_number")?.value || "").trim(),
    customDiscountMode: document.getElementById("custom_discount_mode")?.value || "percent",
    customDiscountValue: Number(document.getElementById("custom_discount_value")?.value || 0),
    discountSupervisorId: approvedDiscountSupervisorId,
    items: cart,
  };

  try {
    const formData = new FormData();
    formData.append("operation", "createSale");
    formData.append("json", JSON.stringify(data));

    const response = await axios.post(apiUrl, formData);
    if (response.data.returnValue === 1) {
      bootstrap.Modal.getInstance(document.getElementById("tender-modal"))?.hide();
      showScanFeedback(`Sale #${response.data.saleId} completed successfully!`);
      showReceipt(response.data.saleId);
      activeHeldId = null;
      activeHoldRef = null;
      document.getElementById("held-sale-status-badge")?.classList.add("d-none");
      closeSale();
      loadSales();
      updateHeldTransactionsBadge();

      // Task 8: Live update suki points across UI without page reload
      await loadFormData();
      if (response.data.newSukiPointsBalance !== undefined && response.data.newSukiPointsBalance !== null) {
        const ptsEl = document.getElementById("suki_points_balance");
        if (ptsEl) ptsEl.value = Number(response.data.newSukiPointsBalance).toFixed(0);
      }
    } else {
      showError(response.data.message || "Unable to record sale.");
    }
  } catch (error) {
    console.error(error);
    showError(error.response?.data?.message || "Transaction failed. Please check network connection.");
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "COMPLETE SALE [Enter]";
    }
  }
};

/* ==========================================================================
   2D Spatial Arrow-Key Navigation Architecture
   ========================================================================== */
let currentSpatialFocusEl = null;

const isElementVisible = (el) => {
  if (!el || !el.isConnected) return false;
  if (el.disabled) return false;
  if (el.closest(".d-none") || el.closest('[style*="display: none"]')) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const setSpatialFocus = (element) => {
  if (!element || !document.body.contains(element)) return;
  if (element.classList.contains("modal") || element.classList.contains("modal-dialog") || element.classList.contains("modal-content")) return;

  // Clear previous .kb-focus anywhere on page
  document.querySelectorAll(".kb-focus").forEach((el) => {
    el.classList.remove("kb-focus");
  });

  currentSpatialFocusEl = element;
  element.classList.add("kb-focus");

  if (document.activeElement !== element) {
    element.focus();
  }

  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
};

const ensureFocusNeverLost = () => {
  if (isAnyModalOpen() || document.querySelector(".swal2-container")) return;
  if (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected) {
    const scan = document.getElementById("barcode-input");
    if (scan) {
      setSpatialFocus(scan);
    }
  } else if (!document.querySelector(".kb-focus")) {
    setSpatialFocus(document.activeElement);
  }
};

const getSpatialNavigableElements = () => {
  const openModal = document.querySelector(".modal.show");
  if (openModal) {
    return Array.from(
      openModal.querySelectorAll(
        'button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), a[href]:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(isElementVisible);
  }

  const activeView = document.querySelector(".pos-view:not(.d-none)") || document.getElementById("view-checkout");
  const candidates = [];

  // Navbar controls
  document.querySelectorAll(".navbar button:not([disabled]), .navbar a:not([disabled])").forEach((el) => {
    if (isElementVisible(el)) candidates.push(el);
  });

  if (activeView) {
    const keySelectors = [
      "#btn-focus-qty",
      "#quantity",
      "#barcode-input",
      "#btn-open-search",
      "#btn-void-item",
      "#btn-void-trans",
      "#cart-table",
      "#btn-mode-cash",
      "#btn-mode-ar",
      "#payment-method-control",
      "#btn-open-discount-modal",
      "#discount-section",
      "#ar-customer-search-filter",
      "#suki-card-toggle",
      "#btn-open-tender",
      "#btn-cancel-sale",
      ".pos-hotkey-dock .pos-hotkey-btn",
      "#sales-search-filter",
      "#btn-refresh-sales",
      "#receipt-lookup-id",
      "#btn-reprint-receipt"
    ];

    keySelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (isElementVisible(el) && !candidates.includes(el)) {
          candidates.push(el);
        }
      });
    });

    activeView
      .querySelectorAll('button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [role="button"]:not([disabled])')
      .forEach((el) => {
        if (isElementVisible(el) && !candidates.includes(el)) {
          candidates.push(el);
        }
      });
  }

  return candidates;
};

const navigateSpatially = (direction) => {
  const current = currentSpatialFocusEl || document.activeElement;
  if (!current || !document.body.contains(current) || current === document.body) {
    const scan = document.getElementById("barcode-input");
    if (scan) setSpatialFocus(scan);
    return;
  }

  // Cart internal navigation
  if (current === document.getElementById("cart-table") || current.closest("#cart-table")) {
    if (direction === "ArrowDown") {
      if (cart.length > 0) {
        if (activeCartIndex < cart.length - 1) {
          activeCartIndex++;
          renderCart();
          setSpatialFocus(document.getElementById("cart-table"));
          return;
        }
      }
    } else if (direction === "ArrowUp") {
      if (cart.length > 0) {
        if (activeCartIndex > 0) {
          activeCartIndex--;
          renderCart();
          setSpatialFocus(document.getElementById("cart-table"));
          return;
        }
      }
    }
  }

  const candidates = getSpatialNavigableElements();
  const rA = current.getBoundingClientRect();
  const cxA = rA.left + rA.width / 2;
  const cyA = rA.top + rA.height / 2;

  let bestCandidate = null;
  let minScore = Infinity;

  for (const candidate of candidates) {
    if (candidate === current) continue;
    if (!isElementVisible(candidate)) continue;

    const rB = candidate.getBoundingClientRect();
    const cxB = rB.left + rB.width / 2;
    const cyB = rB.top + rB.height / 2;

    let isValid = false;
    let primaryDist = 0;
    let secondaryDist = 0;
    let isCrossOverlapping = false;

    switch (direction) {
      case "ArrowRight":
        if (cxB > cxA + 3 || rB.left >= rA.right - 2) {
          isValid = true;
          primaryDist = Math.max(0, rB.left - rA.right);
          secondaryDist = Math.abs(cyB - cyA);
          isCrossOverlapping = (rB.bottom > rA.top + 2 && rB.top < rA.bottom - 2);
        }
        break;

      case "ArrowLeft":
        if (cxB < cxA - 3 || rB.right <= rA.left + 2) {
          isValid = true;
          primaryDist = Math.max(0, rA.left - rB.right);
          secondaryDist = Math.abs(cyB - cyA);
          isCrossOverlapping = (rB.bottom > rA.top + 2 && rB.top < rA.bottom - 2);
        }
        break;

      case "ArrowDown":
        if (cyB > cyA + 3 || rB.top >= rA.bottom - 2) {
          isValid = true;
          primaryDist = Math.max(0, rB.top - rA.bottom);
          secondaryDist = Math.abs(cxB - cxA);
          isCrossOverlapping = (rB.right > rA.left + 2 && rB.left < rA.right - 2);
        }
        break;

      case "ArrowUp":
        if (cyB < cyA - 3 || rB.bottom <= rA.top + 2) {
          isValid = true;
          primaryDist = Math.max(0, rA.top - rB.bottom);
          secondaryDist = Math.abs(cxB - cxA);
          isCrossOverlapping = (rB.right > rA.left + 2 && rB.left < rA.right - 2);
        }
        break;
    }

    if (!isValid) continue;

    const crossWeight = isCrossOverlapping ? 0.35 : 2.5;
    const score = primaryDist + secondaryDist * crossWeight;

    if (score < minScore) {
      minScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestCandidate) {
    setSpatialFocus(bestCandidate);
  }
};

const activateFocusedControl = (e) => {
  const target = (document.activeElement && document.activeElement !== document.body) ? document.activeElement : currentSpatialFocusEl;
  if (!target) return;

  if (target === document.getElementById("barcode-input")) {
    if (isAnyModalOpen() || isDiscountPanelActive()) return;
    e.preventDefault();
    handleBarcodeScan();
    return;
  }

  if (target === document.getElementById("quantity")) {
    e.preventDefault();
    const scan = document.getElementById("barcode-input");
    if (scan) setSpatialFocus(scan);
    return;
  }

  if (target.id === "btn-focus-qty") {
    e.preventDefault();
    focusQuantityInput();
    return;
  }

  if (target.id === "btn-mode-cash") {
    e.preventDefault();
    setSaleMode(SALE_MODE.CASH);
    return;
  }

  if (target.id === "btn-mode-ar") {
    e.preventDefault();
    setSaleMode(SALE_MODE.AR);
    showScanFeedback("Switched to AR CREDIT Mode (F8)");
    return;
  }

  if (target.id === "payment-method-control") {
    e.preventDefault();
    openPaymentMethodModal();
    return;
  }

  if (target.id === "btn-open-discount-modal" || target.id === "discount-section") {
    e.preventDefault();
    openDiscountModal();
    return;
  }

  if (target.id === "suki_card_status") {
    e.preventDefault();
    target.value = target.value === "Has" ? "None" : "Has";
    target.dispatchEvent(new Event("change"));
    showScanFeedback(`SUKI Card: ${target.value === "Has" ? "Has Card" : "None"}`);
    return;
  }

  if (target.id === "btn-open-tender") {
    e.preventDefault();
    triggerActiveCheckout();
    return;
  }

  if (target.id === "btn-cancel-sale") {
    e.preventDefault();
    requestClearCart();
    return;
  }

  if (target.id === "btn-cashier-logout" || target.id === "btn-topbar-logout") {
    e.preventDefault();
    confirmLogout();
    return;
  }

  if (target.id === "nav-tab-checkout") {
    e.preventDefault();
    switchPosView("view-checkout");
    return;
  }

  if (target.id === "nav-tab-recent") {
    e.preventDefault();
    switchPosView("view-recent-sales");
    return;
  }

  if (target.id === "nav-tab-receipts") {
    e.preventDefault();
    switchPosView("view-receipts");
    return;
  }

  if (target.id === "suki-card-toggle" || target.id === "btn-hk-suki") {
    e.preventDefault();
    toggleSukiCard();
    return;
  }

  if (typeof target.click === "function") {
    e.preventDefault();
    target.click();
    return;
  }
};

/* ==========================================================================
   Global Keyboard Handler Architecture (Context-Aware Single Dispatcher)
   ========================================================================== */
const handleGlobalShortcuts = (e) => {
  if (/^F[1-9]$|^F1[0-2]$/.test(e.key)) {
    e.preventDefault();
  }
  if (typeof Swal !== "undefined" && Swal.isVisible()) return;
  if (e.key === "F9" && document.querySelector(".pos-view:not(.d-none)")?.id !== "view-checkout") return;

  // Prevent ALL Function key browser defaults (Chrome kiosk safety)
  // Barcode / Scanner typing redirection:
  // If user types alphanumeric characters while focus is on a button or container,
  // redirect immediately to the scan field without triggering button actions.
  const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && e.key !== " ";
  const activeTag = document.activeElement?.tagName;
  const isTargetTextInput = document.activeElement && (
    (activeTag === "INPUT" && document.activeElement.type !== "radio" && document.activeElement.type !== "checkbox") ||
    activeTag === "TEXTAREA"
  );

  if (openKeyboardDropdown && e.key === "Tab") {
    closeKeyboardDropdown(openKeyboardDropdown, false);
  }

  if (!openKeyboardDropdown && !isAnyModalOpen() && isPrintable && !isTargetTextInput) {
    const scanInput = document.getElementById("barcode-input");
    if (scanInput) {
      setSpatialFocus(scanInput);
      scanInput.focus();
      scanInput.value += e.key;
      e.preventDefault();
      return;
    }
  }

  if (handleKeyboardDropdownKey(e)) return;

  // Context 1: Supervisor Authorization Modal is Open
  const supModal = document.getElementById("supervisor-modal");
  if (supModal && supModal.classList.contains("show")) {
    if (e.key === "Escape" || e.key === "Home" || e.code === "Home") {
      e.preventDefault();
      handleSupervisorCancel();
      return;
    }
    if (e.key === "Tab" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const controls = [
        document.getElementById("supervisor-username"),
        document.getElementById("supervisor-password"),
        document.getElementById("btn-sup-submit"),
        document.getElementById("btn-sup-cancel")
      ].filter(isElementVisible);
      if (controls.length) {
        const idx = controls.indexOf(document.activeElement);
        const dir = (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) ? -1 : 1;
        const nextIdx = idx < 0 ? 0 : (idx + dir + controls.length) % controls.length;
        setSpatialFocus(controls[nextIdx]);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const userInput = document.getElementById("supervisor-username");
      const passInput = document.getElementById("supervisor-password");
      const cancelBtn = document.getElementById("btn-sup-cancel");
      if (document.activeElement === cancelBtn) {
        handleSupervisorCancel();
      } else if (document.activeElement === userInput) {
        setSpatialFocus(passInput);
      } else {
        handleSupervisorSubmit();
      }
      return;
    }
    return;
  }

  // Context 2: Beginning Cash Modal is Open (WP-1 1A: Esc is inert when no open shift)
  const begModal = document.getElementById("beginning-cash-modal");
  if (begModal && begModal.classList.contains("show")) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (currentShiftId !== null) {
        closeBeginningCash();
      }
      return;
    }
    if (e.key === "Tab" || e.key.startsWith("Arrow")) {
      e.preventDefault();
      const controls = [
        document.getElementById("beginning-cash-input"),
        document.getElementById("btn-confirm-beginning-cash"),
        document.getElementById("btn-end-shift"),
        document.getElementById("btn-cancel-logout-shift")
      ].filter(isElementVisible);
      if (controls.length) {
        const idx = controls.indexOf(document.activeElement);
        const dir = (e.key === "ArrowUp" || e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) ? -1 : 1;
        const nextIdx = idx < 0 ? 0 : (idx + dir + controls.length) % controls.length;
        setSpatialFocus(controls[nextIdx]);
      }
      return;
    }
    if (e.key === "Enter" || (e.key === " " && document.activeElement?.tagName === "BUTTON")) {
      e.preventDefault();
      if (document.activeElement === document.getElementById("btn-cancel-logout-shift")) {
        cancelAndLogoutShift();
      } else if (document.activeElement === document.getElementById("btn-end-shift")) {
        bootstrap.Modal.getInstance(begModal)?.hide();
        initiateEndOfShift();
      } else {
        confirmBeginningCash();
      }
    }
    return;
  }

  // Context 2B: End of Shift (EOS) Modal is Open (WP-1 1B)
  const eosModal = document.getElementById("eos-modal");
  if (eosModal && eosModal.classList.contains("show")) {
    const isLockedPhase = !document.getElementById("eos-locked-report-phase")?.classList.contains("d-none");
    if (isLockedPhase) {
      if (e.key === "Escape") {
        e.preventDefault();
        exitPostEosSession();
        return;
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        printActiveEosReport();
        return;
      }
      if (e.key === "Tab" || e.key.startsWith("Arrow")) {
        e.preventDefault();
        const controls = [
          document.getElementById("btn-print-eos-report"),
          document.getElementById("btn-eos-exit-login")
        ].filter(isElementVisible);
        if (controls.length) {
          const idx = controls.indexOf(document.activeElement);
          const dir = (e.key === "ArrowUp" || e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) ? -1 : 1;
          const nextIdx = idx < 0 ? 0 : (idx + dir + controls.length) % controls.length;
          setSpatialFocus(controls[nextIdx]);
        }
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (document.activeElement === document.getElementById("btn-eos-exit-login")) {
          exitPostEosSession();
        } else {
          printActiveEosReport();
        }
        return;
      }
      return;
    } else {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelEndOfShift();
        return;
      }
      if (e.key === "Tab" || e.key.startsWith("Arrow")) {
        e.preventDefault();
        const controls = [
          document.getElementById("eos-actual-cash-input"),
          document.getElementById("btn-confirm-eos"),
          document.getElementById("btn-cancel-eos")
        ].filter(isElementVisible);
        if (controls.length) {
          const idx = controls.indexOf(document.activeElement);
          const dir = (e.key === "ArrowUp" || e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) ? -1 : 1;
          const nextIdx = idx < 0 ? 0 : (idx + dir + controls.length) % controls.length;
          setSpatialFocus(controls[nextIdx]);
        }
        return;
      }
      if (e.key === "Enter" || (e.key === " " && document.activeElement?.tagName === "BUTTON")) {
        e.preventDefault();
        if (document.activeElement === document.getElementById("btn-cancel-eos") || document.activeElement === document.getElementById("btn-close-eos-modal")) {
          cancelEndOfShift();
        } else {
          confirmEndOfShift();
        }
        return;
      }
      return;
    }
  }

  // Context 3: Cash Drawer Event Modal is Open
  const drawerModal = document.getElementById("drawer-event-modal");
  if (drawerModal && drawerModal.classList.contains("show")) {
    const activeEl = document.activeElement;
    const amountInput = document.getElementById("drawer-event-amount");
    const notesInput = document.getElementById("drawer-event-notes");
    const cancelBtn = document.getElementById("btn-cancel-drawer-event");
    const submitBtn = document.getElementById("btn-submit-drawer-event");
    const floatBtn = document.getElementById("btn-drawer-type-float");
    const liftBtn = document.getElementById("btn-drawer-type-lift");
    const activeTypeBtn = activeDrawerEventType === "lift" ? liftBtn : floatBtn;

    const focusedType = activeEl === floatBtn ||
      activeEl === liftBtn ||
      activeEl === document.getElementById("drawer-type-float") ||
      activeEl === document.getElementById("drawer-type-lift") ||
      e.target === floatBtn ||
      e.target === liftBtn ||
      e.target === document.getElementById("drawer-type-float") ||
      e.target === document.getElementById("drawer-type-lift");

    if (e.key === "Escape") {
      e.preventDefault();
      bootstrap.Modal.getInstance(drawerModal)?.hide();
      focusBarcodeInput();
      return;
    }

    // ArrowDown: Move to next row/input field
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (focusedType) {
        if (amountInput) {
          setSpatialFocus(amountInput);
          amountInput.focus();
          amountInput.select();
        }
      } else if (activeEl === amountInput) {
        if (notesInput) {
          setSpatialFocus(notesInput);
          notesInput.focus();
        }
      } else if (activeEl === notesInput) {
        if (submitBtn) {
          setSpatialFocus(submitBtn);
          submitBtn.focus();
        }
      } else if (activeEl === cancelBtn || activeEl === submitBtn) {
        if (activeTypeBtn) {
          setSpatialFocus(activeTypeBtn);
          activeTypeBtn.focus();
        }
      } else {
        if (amountInput) {
          setSpatialFocus(amountInput);
          amountInput.focus();
          amountInput.select();
        }
      }
      return;
    }

    // ArrowUp: Move to previous row/input field
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (focusedType) {
        if (submitBtn) {
          setSpatialFocus(submitBtn);
          submitBtn.focus();
        }
      } else if (activeEl === amountInput) {
        if (activeTypeBtn) {
          setSpatialFocus(activeTypeBtn);
          activeTypeBtn.focus();
        }
      } else if (activeEl === notesInput) {
        if (amountInput) {
          setSpatialFocus(amountInput);
          amountInput.focus();
          amountInput.select();
        }
      } else if (activeEl === cancelBtn || activeEl === submitBtn) {
        if (notesInput) {
          setSpatialFocus(notesInput);
          notesInput.focus();
        }
      } else {
        if (activeTypeBtn) {
          setSpatialFocus(activeTypeBtn);
          activeTypeBtn.focus();
        }
      }
      return;
    }

    // ArrowLeft / ArrowRight: Horizontal selection within rows
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (focusedType) {
        e.preventDefault();
        const type = e.key === "ArrowLeft" ? "float" : "lift";
        setDrawerEventType(type);
        const typeLabel = document.getElementById(type === "float" ? "btn-drawer-type-float" : "btn-drawer-type-lift");
        if (typeLabel) {
          setSpatialFocus(typeLabel);
          typeLabel.focus();
        }
        return;
      }
      if (activeEl === cancelBtn || activeEl === submitBtn) {
        e.preventDefault();
        const targetBtn = activeEl === cancelBtn ? submitBtn : cancelBtn;
        if (targetBtn) {
          setSpatialFocus(targetBtn);
          targetBtn.focus();
        }
        return;
      }
      // On text/number inputs (amount, notes), allow native cursor caret movement
      return;
    }

    // Tab / Shift+Tab Navigation
    if (e.key === "Tab") {
      const allFocusable = [
        activeTypeBtn,
        amountInput,
        notesInput,
        cancelBtn,
        submitBtn
      ].filter(isElementVisible);
      if (allFocusable.length > 0) {
        e.preventDefault();
        const curIdx = allFocusable.indexOf(document.activeElement);
        const nextIdx = e.shiftKey
          ? (curIdx - 1 + allFocusable.length) % allFocusable.length
          : (curIdx + 1) % allFocusable.length;
        setSpatialFocus(allFocusable[nextIdx]);
        allFocusable[nextIdx].focus();
        if (allFocusable[nextIdx] === amountInput) {
          amountInput.select();
        }
      }
      return;
    }

    // Enter Key
    if (e.key === "Enter") {
      if (focusedType) {
        e.preventDefault();
        if (amountInput) {
          setSpatialFocus(amountInput);
          amountInput.focus();
          amountInput.select();
        }
        return;
      }
      if (activeEl === amountInput) {
        e.preventDefault();
        if (notesInput) {
          setSpatialFocus(notesInput);
          notesInput.focus();
        }
        return;
      }
      if (activeEl === cancelBtn) {
        e.preventDefault();
        bootstrap.Modal.getInstance(drawerModal)?.hide();
        focusBarcodeInput();
        return;
      }
      e.preventDefault();
      submitDrawerEvent();
      return;
    }
    return;
  }

  // Context 4: Product Search Modal is Open
  const searchModal = document.getElementById("product-search-modal");
  if (searchModal && searchModal.classList.contains("show")) {
    if (e.key === "Escape") {
      e.preventDefault();
      bootstrap.Modal.getInstance(searchModal)?.hide();
      focusBarcodeInput();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentSearchResults.length > 0) {
        searchResultIndex = (searchResultIndex + 1) % currentSearchResults.length;
        renderProductSearchResults(currentSearchResults);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentSearchResults.length > 0) {
        searchResultIndex = (searchResultIndex - 1 + currentSearchResults.length) % currentSearchResults.length;
        renderProductSearchResults(currentSearchResults);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (searchResultIndex >= 0 && searchResultIndex < currentSearchResults.length) {
        selectSearchedProduct(searchResultIndex);
      }
      return;
    }
    return;
  }

  // Context 5: Quantity Override Modal is Open
  const qtyModal = document.getElementById("quantity-modal");
  if (qtyModal && qtyModal.classList.contains("show")) {
    if (e.key === "Escape") {
      e.preventDefault();
      bootstrap.Modal.getInstance(qtyModal)?.hide();
      focusBarcodeInput();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      confirmQuantityOverride();
      return;
    }
    return;
  }

  // Context 6: Tender Modal is Open
  const tenderModal = document.getElementById("tender-modal");
  if (tenderModal && tenderModal.classList.contains("show")) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      const isAr = currentSaleMode === SALE_MODE.AR;
      const tenderCashInput = document.getElementById("tender-cash-input");
      const tendered = Number(tenderCashInput?.value || 0);
      if (!isAr && tendered > 0) {
        if (!confirm("Tender amount has been entered. Discard payment and return to register?")) {
          return;
        }
      }
      bootstrap.Modal.getInstance(tenderModal)?.hide();
      releaseTenderOpenLock();
      focusBarcodeInput();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      cycleQuickCashPreset(1);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      cycleQuickCashPreset(-1);
      return;
    }
    if (e.key === "Enter" || e.key === "F12") {
      e.preventDefault();
      executeCheckout();
      return;
    }
    return;
  }

  // Context 7: Resume Sale Modal is Open
  const resumeModal = document.getElementById("resume-transaction-modal");
  if (resumeModal && resumeModal.classList.contains("show")) {
    const listToNav = filteredHeldTransactions;
    if (e.key === "Escape") {
      e.preventDefault();
      bootstrap.Modal.getInstance(resumeModal)?.hide();
      focusBarcodeInput();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (listToNav.length > 0) {
        activeHeldRecordIndex = (activeHeldRecordIndex + 1) % listToNav.length;
        renderHeldTransactionsList(listToNav);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (listToNav.length > 0) {
        activeHeldRecordIndex = (activeHeldRecordIndex - 1 + listToNav.length) % listToNav.length;
        renderHeldTransactionsList(listToNav);
      }
      return;
    }
    if (e.key === "Delete" && document.activeElement !== document.getElementById("held-search-filter")) {
      e.preventDefault();
      if (listToNav.length > 0 && activeHeldRecordIndex >= 0 && activeHeldRecordIndex < listToNav.length) {
        discardHeldTransaction(listToNav[activeHeldRecordIndex].held_id);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (listToNav.length > 0 && activeHeldRecordIndex >= 0 && activeHeldRecordIndex < listToNav.length) {
        resumeHeldTransaction(listToNav[activeHeldRecordIndex].held_id);
      }
      return;
    }
    return;
  }

  // Context 8: Hold Transaction Modal is Open
  const holdModal = document.getElementById("hold-transaction-modal");
  if (holdModal && holdModal.classList.contains("show")) {
    if (e.key === "Escape") {
      e.preventDefault();
      bootstrap.Modal.getInstance(holdModal)?.hide();
      focusBarcodeInput();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      executeHold();
      return;
    }
    return;
  }

  // Context 9: Clear Cart Confirmation Modal is Open
  const clearCartModal = document.getElementById("clear-cart-confirm-modal");
  if (clearCartModal && clearCartModal.classList.contains("show")) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelClearCart();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      confirmClearCart();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Tab") {
      e.preventDefault();
      return;
    }
    return;
  }

  // Context 9B: Payment Method Selection Modal is Open
  const pmModal = document.getElementById("payment-method-modal");
  if (pmModal && pmModal.classList.contains("show")) {
    if (e.key === "Escape") {
      e.preventDefault();
      closePaymentMethodModal();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (availablePaymentMethods.length > 0) {
        selectedPaymentMethodIndex = (selectedPaymentMethodIndex + 1) % availablePaymentMethods.length;
        highlightPaymentMethodOption(selectedPaymentMethodIndex);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (availablePaymentMethods.length > 0) {
        selectedPaymentMethodIndex = (selectedPaymentMethodIndex - 1 + availablePaymentMethods.length) % availablePaymentMethods.length;
        highlightPaymentMethodOption(selectedPaymentMethodIndex);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      selectPaymentMethod(selectedPaymentMethodIndex);
      return;
    }
    if (e.key >= "1" && e.key <= "9") {
      const numIdx = parseInt(e.key, 10) - 1;
      if (numIdx >= 0 && numIdx < availablePaymentMethods.length) {
        e.preventDefault();
        selectPaymentMethod(numIdx);
      }
      return;
    }
    return;
  }

  // Context 9C: Discount Selection Modal is Open (FIX 1 & FIX 2)
  const discModalEl = document.getElementById("discount-selection-modal");
  if (discModalEl && discModalEl.classList.contains("show")) {
    if (currentDiscountModalPhase === 1) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeDiscountModal();
        return;
      }
      const visibleOpts = getVisibleDiscountOptions();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (visibleOpts.length > 0) {
          selectedDiscountTypeIndex = (selectedDiscountTypeIndex + 1) % visibleOpts.length;
          highlightDiscountOption(selectedDiscountTypeIndex);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (visibleOpts.length > 0) {
          selectedDiscountTypeIndex = (selectedDiscountTypeIndex - 1 + visibleOpts.length) % visibleOpts.length;
          highlightDiscountOption(selectedDiscountTypeIndex);
        }
        return;
      }
      if (e.key === "1") {
        e.preventDefault();
        switchToDiscountIdPhase("senior");
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        switchToDiscountIdPhase("pwd");
        return;
      }
      if (e.key === "3") {
        e.preventDefault();
        handleNoDiscountSelection();
        return;
      }
      if (e.key === "4" && visibleOpts.length > 3) {
        e.preventDefault();
        removeDiscountAndClose();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const activeOpt = visibleOpts[selectedDiscountTypeIndex];
        const discType = activeOpt?.getAttribute("data-discount");
        if (discType === "senior" || discType === "pwd") {
          switchToDiscountIdPhase(discType);
        } else if (discType === "zero") {
          handleNoDiscountSelection();
        } else if (discType === "none") {
          removeDiscountAndClose();
        }
        return;
      }
      if (e.key === "Tab") {
        const focusable = Array.from(discModalEl.querySelectorAll("button:not([disabled]), input:not([disabled])")).filter(isElementVisible);
        if (focusable.length > 0) {
          e.preventDefault();
          const curIdx = focusable.indexOf(document.activeElement);
          const nextIdx = e.shiftKey ? (curIdx - 1 + focusable.length) % focusable.length : (curIdx + 1) % focusable.length;
          setSpatialFocus(focusable[nextIdx]);
          focusable[nextIdx].focus();
        }
        return;
      }
    } else if (currentDiscountModalPhase === 2) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        switchToDiscountTypePhase();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        applyStatutoryDiscountFromModal();
        return;
      }
      if (e.key === "Tab") {
        const focusable = Array.from(discModalEl.querySelectorAll("button:not([disabled]), input:not([disabled])")).filter(isElementVisible);
        if (focusable.length > 0) {
          e.preventDefault();
          const curIdx = focusable.indexOf(document.activeElement);
          const nextIdx = e.shiftKey ? (curIdx - 1 + focusable.length) % focusable.length : (curIdx + 1) % focusable.length;
          setSpatialFocus(focusable[nextIdx]);
          focusable[nextIdx].focus();
        }
        return;
      }
      if (document.activeElement === document.getElementById("discount-modal-id-input")) {
        e.stopPropagation();
        return;
      }
    }
    return;
  }

  // Context 9D: Receipt Modal is Open (TASK: All receipt buttons work by keyboard and mouse)
  const receiptModalEl = document.getElementById("receipt-modal");
  if (receiptModalEl && receiptModalEl.classList.contains("show")) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeReceiptModal();
      return;
    }
    const receiptBtns = getReceiptModalButtons();
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      if (receiptBtns.length > 0) {
        selectedReceiptButtonIndex = (selectedReceiptButtonIndex + 1) % receiptBtns.length;
        highlightReceiptButton(selectedReceiptButtonIndex);
      }
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      if (receiptBtns.length > 0) {
        selectedReceiptButtonIndex = (selectedReceiptButtonIndex - 1 + receiptBtns.length) % receiptBtns.length;
        highlightReceiptButton(selectedReceiptButtonIndex);
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const allFocusable = [
        document.getElementById("btn-close-receipt-modal"),
        ...receiptBtns,
      ].filter(isElementVisible);
      if (allFocusable.length > 0) {
        const curIdx = allFocusable.indexOf(document.activeElement);
        const nextIdx = e.shiftKey
          ? (curIdx - 1 + allFocusable.length) % allFocusable.length
          : (curIdx + 1) % allFocusable.length;
        setSpatialFocus(allFocusable[nextIdx]);
        allFocusable[nextIdx].focus();
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (document.activeElement && document.activeElement.id === "btn-close-receipt-modal") {
        closeReceiptModal();
        return;
      }
      const activeBtn = receiptBtns[selectedReceiptButtonIndex] || document.activeElement;
      if (activeBtn && typeof activeBtn.click === "function") {
        activeBtn.click();
      }
      return;
    }
    // Block all other keys (including F1-F12 and scanning alphanumeric typing) while receipt modal is open
    return;
  }

  // Context 10: Any other modal open (e.g. Hotkey Help)
  if (isAnyModalOpen()) {
    if (e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      document.querySelectorAll(".modal.show").forEach((m) => {
        bootstrap.Modal.getInstance(m)?.hide();
      });
      focusBarcodeInput();
    }
    return;
  }

  // Context 11: Active POS Checkout Register View

  // Tab: Logical zones navigation
  if (e.key === "Tab") {
    e.preventDefault();
    cycleRegisterLogicalZone(e.shiftKey ? -1 : 1);
    return;
  }

  // Spatial Arrow-Key Navigation across all buttons/controls
  if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    navigateSpatially(e.key);
    return;
  }

  // Enter or Space: Activate focused control
  if (e.key === "Enter" || e.key === " ") {
    if (isAnyModalOpen() || isDiscountPanelActive()) {
      return;
    }
    if (document.activeElement === document.getElementById("suki-card-toggle")) {
      e.preventDefault();
      toggleSukiCard();
      return;
    }
    if (e.key === " " && !isTargetTextInput && currentSaleMode === SALE_MODE.CASH) {
      e.preventDefault();
      toggleSukiCard();
      return;
    }
    if (document.activeElement === document.getElementById("barcode-input")) {
      e.preventDefault();
      handleBarcodeScan();
      return;
    }
    if (document.activeElement === document.getElementById("quantity")) {
      e.preventDefault();
      const scan = document.getElementById("barcode-input");
      if (scan) setSpatialFocus(scan);
      return;
    }
    if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT")) {
      // Allow select or input native action if desirable
      activateFocusedControl(e);
      return;
    }
    activateFocusedControl(e);
    return;
  }

  // Escape / Home: Return to home scan field, or clear cart
  if (e.key === "Escape" || e.key === "Home" || e.code === "Home") {
    e.preventDefault();
    const activeView = document.querySelector(".pos-view:not(.d-none)");
    if (activeView && activeView.id !== "view-checkout") {
      switchPosView("view-checkout");
      setSpatialFocus(document.getElementById("barcode-input"));
      return;
    }
    if (currentSpatialFocusEl && currentSpatialFocusEl !== document.getElementById("barcode-input")) {
      setSpatialFocus(document.getElementById("barcode-input"));
      return;
    }
    if (cart.length > 0) {
      requestClearCart();
    } else {
      showScanFeedback("Register ready.");
    }
    return;
  }

  // Alt+D: Discount Picker (FIX 3)
  if (e.altKey && (e.key === "d" || e.key === "D" || e.code === "KeyD")) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAnyModalOpen()) {
      openDiscountKeyboardFlow();
    }
    return;
  }

  // Alt+E: End of Shift (EOS)
  if (e.altKey && (e.key === "e" || e.key === "E")) {
    e.preventDefault();
    initiateEndOfShift();
    return;
  }

  // Dedicated Function Key Shortcuts
  switch (e.key) {
    case "F1":
    case "F2":
      openProductSearchModal();
      break;

    case "F3":
      focusQuantityInput();
      break;

    case "F4":
      voidActiveItem();
      break;

    case "F5":
      requestVoidTransaction();
      break;

    case "F6":
      triggerHoldTransaction();
      break;

    case "F7":
      openDrawerEventModal();
      break;

    case "F8":
      if (isAnyModalOpen()) return;
      if (openKeyboardDropdown) {
        closeKeyboardDropdown(openKeyboardDropdown, false);
        return;
      }
      const arListEl = document.getElementById("ar-customer-typeahead-list");
      if (arListEl && !arListEl.classList.contains("d-none")) {
        closeArCustomerTypeahead();
        return;
      }
      openArCustomerFlow();
      break;

    case "F9":
      if (isAnyModalOpen()) return;
      setSaleMode(SALE_MODE.CASH);
      const pmCtrl = document.getElementById("payment-method-control");
      if (pmCtrl) {
        setSpatialFocus(pmCtrl);
        pmCtrl.focus();
      }
      openPaymentMethodModal();
      break;

    case "F10":
      openResumeModal();
      break;

    case "F11":
      toggleFullscreen();
      break;

    case "F12":
      triggerActiveCheckout();
      break;

    default:
      break;
  }
};

/* ==========================================================================
   Unified Topmost Modal Escape Consumer (FIX 3)
   ========================================================================== */
const handleTopmostModalEscape = (e) => {
  if (e.key !== "Escape" && e.key !== "Home" && e.code !== "Home") return;

  // 1. SweetAlert2 popup
  if (typeof Swal !== "undefined" && Swal.isVisible()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    Swal.close();
    return;
  }

  // 2. Beginning cash modal (Inert if currentShiftId === null)
  const begModal = document.getElementById("beginning-cash-modal");
  if (begModal && begModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (currentShiftId !== null) {
      closeBeginningCash();
    }
    return;
  }

  // 3. Supervisor modal
  const supModal = document.getElementById("supervisor-modal");
  if (supModal && supModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    handleSupervisorCancel();
    return;
  }

  // 4. Clear cart confirmation modal
  const clearModal = document.getElementById("clear-cart-confirm-modal");
  if (clearModal && clearModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    cancelClearCart();
    return;
  }

  // 5. Payment method modal
  const pmModal = document.getElementById("payment-method-modal");
  if (pmModal && pmModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    closePaymentMethodModal();
    return;
  }

  // 6. Tender modal
  const tenderModal = document.getElementById("tender-modal");
  if (tenderModal && tenderModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const isAr = currentSaleMode === SALE_MODE.AR;
    const tenderCashInput = document.getElementById("tender-cash-input");
    const tendered = Number(tenderCashInput?.value || 0);
    if (!isAr && tendered > 0) {
      if (!confirm("Tender amount has been entered. Discard payment and return to register?")) {
        return;
      }
    }
    bootstrap.Modal.getInstance(tenderModal)?.hide();
    releaseTenderOpenLock();
    focusBarcodeInput();
    return;
  }

  // 7. EOS modal
  const eosModal = document.getElementById("eos-modal");
  if (eosModal && eosModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const isLockedPhase = !document.getElementById("eos-locked-report-phase")?.classList.contains("d-none");
    if (isLockedPhase) {
      exitPostEosSession();
    } else {
      cancelEndOfShift();
    }
    return;
  }

  // 8. Drawer event modal
  const drawerModal = document.getElementById("drawer-event-modal");
  if (drawerModal && drawerModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    bootstrap.Modal.getInstance(drawerModal)?.hide();
    focusBarcodeInput();
    return;
  }

  // 9. Product search / lookup modal
  const searchModal = document.getElementById("product-search-modal");
  if (searchModal && searchModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    bootstrap.Modal.getInstance(searchModal)?.hide();
    focusBarcodeInput();
    return;
  }

  // 10. Quantity modal
  const qtyModal = document.getElementById("quantity-modal");
  if (qtyModal && qtyModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    bootstrap.Modal.getInstance(qtyModal)?.hide();
    focusBarcodeInput();
    return;
  }

  // 11. Hold transaction modal
  const holdModal = document.getElementById("hold-transaction-modal");
  if (holdModal && holdModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    bootstrap.Modal.getInstance(holdModal)?.hide();
    focusBarcodeInput();
    return;
  }

  // 12. Resume transaction modal
  const resumeModal = document.getElementById("resume-transaction-modal");
  if (resumeModal && resumeModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    bootstrap.Modal.getInstance(resumeModal)?.hide();
    focusBarcodeInput();
    return;
  }

  // 13. Discount selection modal (Phase 2 -> Phase 1, Phase 1 -> Close)
  const discModal = document.getElementById("discount-selection-modal");
  if (discModal && discModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (currentDiscountModalPhase === 2) {
      switchToDiscountTypePhase();
    } else {
      closeDiscountModal();
    }
    return;
  }

  // 15. Receipt modal
  const receiptModal = document.getElementById("receipt-modal");
  if (receiptModal && receiptModal.classList.contains("show")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    closeReceiptModal();
    return;
  }

  // 16. AR Customer Typeahead suggestions dropdown
  const arTypeahead = document.getElementById("ar-customer-typeahead-list");
  if (arTypeahead && !arTypeahead.classList.contains("d-none")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    closeArCustomerTypeahead();
    document.getElementById("ar-customer-search-filter")?.focus();
    return;
  }

  // 17. Active inline Discount panel
  if (isDiscountPanelActive()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    closeDiscountKeyboardFlow();
    focusBarcodeInput();
    return;
  }

  // 18. Any generic .modal.show
  const anyModal = document.querySelector(".modal.show");
  if (anyModal) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    bootstrap.Modal.getInstance(anyModal)?.hide();
    focusBarcodeInput();
    return;
  }
};

/* ==========================================================================
   Credit Eligibility Logic (Preserved 100% from existing codebase)
   ========================================================================== */
const updateSaleTypeFields = () => {
  const isAr = currentSaleMode === SALE_MODE.AR;
  const customerField = document.getElementById("customer-field");
  const customerSelect = document.getElementById("ar_customer_id");
  const paymentMethodField = document.getElementById("sale-payment-method-field");
  const paymentMethodSelect = document.getElementById("sale_payment_method_id");

  if (customerField) customerField.classList.toggle("d-none", !isAr);
  if (customerSelect) customerSelect.required = isAr;
  if (paymentMethodField) paymentMethodField.classList.toggle("d-none", isAr);
  if (paymentMethodSelect) {
    paymentMethodSelect.required = !isAr;
  }
  updateSukiFields();
  refreshCreditEligibility();
};


const syncSukiToggleUI = (hasCard) => {
  const sukiToggle = document.getElementById("suki-card-toggle");
  const sukiStatusHidden = document.getElementById("suki_card_status");
  const sukiBadge = document.getElementById("suki-status-badge");
  const sukiToggleCard = document.getElementById("suki-toggle-card");
  const isChecked = Boolean(hasCard);
  if (sukiToggle) sukiToggle.checked = isChecked;
  if (sukiStatusHidden) sukiStatusHidden.value = isChecked ? "Has" : "None";
  if (sukiBadge) {
    sukiBadge.textContent = isChecked ? "Has Card" : "No Card";
    sukiBadge.className = isChecked ? "text-success fw-bold" : "text-secondary";
  }
  if (sukiToggleCard) {
    sukiToggleCard.classList.toggle("border-success", isChecked);
  }
  updateSukiFields();
  renderCart();
};

const toggleSukiCard = () => {
  const sukiToggle = document.getElementById("suki-card-toggle");
  if (!sukiToggle || currentSaleMode !== SALE_MODE.CASH) return;

  sukiToggle.checked = !sukiToggle.checked;
  syncSukiToggleUI(sukiToggle.checked);
  showScanFeedback("SUKI Card: " + (sukiToggle.checked ? "Attached" : "Removed"));
};

const updateSukiFields = () => {
  const isAr = currentSaleMode === SALE_MODE.AR;
  const status = document.getElementById("suki_card_status")?.value;
  const pointsField = document.getElementById("suki-points-field");
  const pointsInput = document.getElementById("suki_points_balance");
  const registeredCardField = document.getElementById("suki-registered-card-field");
  const registeredCardSelect = document.getElementById("suki_card_id");

  document.getElementById("suki-cash-field")?.classList.toggle("d-none", isAr);
  document.getElementById("suki-ar-field")?.classList.toggle("d-none", !isAr);
  if (pointsField) pointsField.classList.toggle("d-none", isAr || status !== "Has");
  if (registeredCardField) registeredCardField.classList.toggle("d-none", isAr || status !== "Has");
  if (pointsInput) pointsInput.required = false;

  if (isAr) {
    if (registeredCardSelect) registeredCardSelect.value = "";
    const customerId = document.getElementById("ar_customer_id")?.value;
    const customerCards = sukiCards.filter((card) => String(card.ar_customer_id) === customerId);
    let cardInfo = "Select an AR Customer to check their SUKI card.";
    if (customerId && customerCards.length === 0) {
      cardInfo = "No active SUKI card is linked to this customer.";
    } else if (customerCards.length === 1) {
      const card = customerCards[0];
      cardInfo = `Has — Card ${card.card_number}, ${Number(card.points_balance || 0).toFixed(0)} points`;
    } else if (customerCards.length > 1) {
      cardInfo = "Multiple active SUKI cards are linked. Ask AR Staff to resolve this before completing the sale.";
    }
    const arCardInfoEl = document.getElementById("suki-ar-card-info");
    if (arCardInfoEl) arCardInfoEl.textContent = cardInfo;
  } else if (status !== "Has") {
    if (pointsInput) pointsInput.value = "";
    if (registeredCardSelect) registeredCardSelect.value = "";
    const cardCustEl = document.getElementById("suki-card-customer");
    if (cardCustEl) cardCustEl.textContent = "";
  } else {
    const card = sukiCards.find((r) => String(r.sku_card_id) === registeredCardSelect?.value);
    const cardCustEl = document.getElementById("suki-card-customer");
    if (card) {
      if (pointsInput) pointsInput.value = Number(card.points_balance || 0).toFixed(0);
      if (cardCustEl) {
        cardCustEl.textContent = `Linked customer: ${arCustomers.find((c) => String(c.ar_customer_id) === String(card.ar_customer_id))?.customer_name || "Customer"}. Sale records this balance snapshot.`;
      }
    } else {
      if (pointsInput) pointsInput.value = "";
      if (cardCustEl) {
        cardCustEl.textContent = "For an unregistered card, enter the points shown by the customer.";
      }
    }
  }
  syncKeyboardDropdown("suki_card_status");
  syncKeyboardDropdown("suki_card_id");
};

const updateCreditEligibility = () => {
  const eligibility = document.getElementById("credit-eligibility");
  const isAr = currentSaleMode === SALE_MODE.AR;
  const customer = arCustomers.find((r) => String(r.ar_customer_id) === document.getElementById("ar_customer_id")?.value);
  if (!isAr || !customer || !eligibility) {
    if (eligibility) {
      eligibility.textContent = "";
      eligibility.className = "small mt-1";
    }
    return null;
  }
  const creditLimit = Number(customer.credit_limit || 0);
  const exposure = Number(customer.credit_exposure || 0);
  const available = creditLimit - exposure;
  const overdueCount = Number(customer.overdue_invoice_count || 0);
  const overdueBalance = Number(customer.overdue_balance || 0);
  const blockFlag = customer.block_overdue_accounts !== undefined
    ? Number(customer.block_overdue_accounts) === 1
    : Number(arOverduePolicy.block_overdue_accounts ?? 1) === 1;
  const blockedByOverdue = blockFlag && overdueCount > 0;
  const estimatedTotal = cart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const eligible = !blockedByOverdue && estimatedTotal > 0 && exposure + estimatedTotal <= creditLimit;

  if (blockedByOverdue) {
    eligibility.textContent = `BLOCKED (OVERDUE AR): Customer has ${overdueCount} overdue invoice(s) totaling ₱${overdueBalance.toFixed(2)}. Settle overdue balance before new AR sale.`;
    eligibility.className = "small mt-1 text-danger fw-bold";
    return { eligible: false, blockedByOverdue: true, overdueCount, overdueBalance, available, creditLimit, exposure, estimatedTotal };
  }

  eligibility.textContent = `Credit limit: ₱${creditLimit.toFixed(2)} · Exposure: ₱${exposure.toFixed(2)} · Available: ₱${available.toFixed(2)} · ${estimatedTotal > 0
    ? `${eligible ? "Eligible" : "Not eligible"} for this sale (estimated exposure: ₱${(exposure + estimatedTotal).toFixed(2)}).`
    : "Add products to check eligibility."
    }`;
  eligibility.className = `small mt-1 ${estimatedTotal > 0 ? (eligible ? "text-success fw-bold" : "text-danger fw-bold") : "text-muted"}`;
  return { eligible, blockedByOverdue: false, overdueCount, overdueBalance, available, creditLimit, exposure, estimatedTotal };
};

const refreshCreditEligibility = async () => {
  const customerId = document.getElementById("ar_customer_id")?.value;
  if (currentSaleMode !== SALE_MODE.AR || !customerId) {
    updateCreditEligibility();
    return false;
  }
  try {
    const { data } = await axios.get(apiUrl, {
      params: { operation: "getCreditEligibility", customerId },
    });
    if (document.getElementById("ar_customer_id")?.value !== customerId) return false;
    const customer = arCustomers.find((r) => String(r.ar_customer_id) === customerId);
    if (!customer) throw new Error("Selected customer is not available.");
    Object.assign(customer, data);
    const check = updateCreditEligibility();
    if (check?.blockedByOverdue) {
      showScanFeedback(
        `AR Account Blocked: ${customer.customer_name} has ${check.overdueCount} overdue invoice(s) (₱${check.overdueBalance.toFixed(2)}).`,
        true
      );
    }
    return true;
  } catch (error) {
    console.error(error);
    const eligibility = document.getElementById("credit-eligibility");
    if (eligibility) {
      eligibility.textContent = error.response?.data?.message || "Unable to verify credit eligibility.";
      eligibility.className = "small mt-1 text-danger fw-bold";
    }
    return false;
  }
};

/* ==========================================================================
   AR Customer Type-Ahead Live Search (FIX 2)
   ========================================================================== */
let arSearchDebounceTimeout = null;
let arSearchRequestSeq = 0;
let arSearchSuggestions = [];
let arSearchHighlightedIndex = -1;

const highlightSearchMatch = (text, query) => {
  if (!text) return "";
  const safeText = escapeHtml(String(text));
  const q = String(query || "").trim();
  if (!q) return safeText;
  const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return safeText.replace(regex, '<mark class="search-match fw-bold text-primary p-0 bg-transparent text-decoration-underline">$1</mark>');
};

const closeArCustomerTypeahead = () => {
  clearTimeout(arSearchDebounceTimeout);
  const listEl = document.getElementById("ar-customer-typeahead-list");
  if (listEl) {
    listEl.classList.add("d-none");
    listEl.innerHTML = "";
  }
  arSearchSuggestions = [];
  arSearchHighlightedIndex = -1;
};

const updateArCustomerTypeaheadHighlight = () => {
  const listEl = document.getElementById("ar-customer-typeahead-list");
  if (!listEl) return;
  const options = listEl.querySelectorAll('[role="option"]:not(.pos-no-matches)');
  options.forEach((opt, idx) => {
    if (idx === arSearchHighlightedIndex) {
      opt.classList.add("is-highlighted");
      opt.scrollIntoView({ block: "nearest" });
    } else {
      opt.classList.remove("is-highlighted");
    }
  });
};

const selectArCustomerSuggestion = (customer) => {
  if (!customer) return;
  const existing = arCustomers.find((c) => String(c.ar_customer_id) === String(customer.ar_customer_id));
  if (!existing) {
    arCustomers.push(customer);
  } else {
    Object.assign(existing, customer);
  }
  const select = document.getElementById("ar_customer_id");
  if (select) {
    if (select.tagName === "SELECT" && select.options) {
      let opt = Array.from(select.options).find((o) => o.value === String(customer.ar_customer_id));
      if (!opt) {
        opt = document.createElement("option");
        opt.value = String(customer.ar_customer_id);
        opt.textContent = customer.customer_name;
        select.appendChild(opt);
      }
    }
    select.value = String(customer.ar_customer_id);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const searchInput = document.getElementById("ar-customer-search-filter");
  if (searchInput) searchInput.value = customer.customer_name;
  closeArCustomerTypeahead();
  focusBarcodeInput();
};

const renderArCustomerTypeahead = (items, query) => {
  const listEl = document.getElementById("ar-customer-typeahead-list");
  if (!listEl) return;
  arSearchSuggestions = items || [];
  arSearchHighlightedIndex = arSearchSuggestions.length > 0 ? 0 : -1;
  listEl.innerHTML = "";

  if (!arSearchSuggestions.length) {
    listEl.innerHTML = '<div class="typeahead-empty p-2 text-muted text-center small fst-italic pos-no-matches">No matching customers</div>';
    listEl.classList.remove("d-none");
    return;
  }

  arSearchSuggestions.forEach((cust, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `typeahead-suggestion-item pos-keyboard-select-option w-100 text-start py-1 px-2 border-0 bg-transparent ${idx === 0 ? "is-highlighted" : ""}`;
    btn.setAttribute("role", "option");
    btn.setAttribute("data-index", idx);
    btn.tabIndex = -1;

    const avail = Number(cust.available_credit || 0);
    const availCls = avail > 0 ? "text-success fw-bold" : "text-danger fw-bold";
    const phonePart = cust.contact_phone ? `<span class="small text-muted ms-2 font-monospace">Tel: ${highlightSearchMatch(cust.contact_phone, query)}</span>` : "";
    const namePart = highlightSearchMatch(cust.customer_name, query);

    btn.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <span class="fw-bold">${namePart}</span>
          <span class="badge bg-secondary ms-1">#${cust.ar_customer_id}</span>
          ${phonePart}
        </div>
        <div class="text-end font-monospace small">
          <span class="${availCls}">Avail: ₱${avail.toFixed(2)}</span>
        </div>
      </div>
    `;

    btn.addEventListener("click", () => {
      selectArCustomerSuggestion(cust);
    });
    listEl.appendChild(btn);
  });

  listEl.classList.remove("d-none");
  updateArCustomerTypeaheadHighlight();
};

const handleArCustomerSearchInput = (e) => {
  const query = (e.target.value || "").trim();
  clearTimeout(arSearchDebounceTimeout);
  if (!query) {
    closeArCustomerTypeahead();
    return;
  }

  arSearchDebounceTimeout = setTimeout(async () => {
    const currentSeq = ++arSearchRequestSeq;
    try {
      const { data } = await axios.get(apiUrl, {
        params: { operation: "searchArCustomers", query },
        withCredentials: true
      });
      if (currentSeq !== arSearchRequestSeq) return; // Stale response discarded
      renderArCustomerTypeahead(data.customers || [], query);
    } catch (err) {
      if (currentSeq === arSearchRequestSeq) {
        const lower = query.toLowerCase();
        const localMatches = arCustomers.filter(c =>
          String(c.customer_name || "").toLowerCase().includes(lower) ||
          String(c.ar_customer_id || "").includes(lower) ||
          String(c.contact_phone || "").toLowerCase().includes(lower)
        );
        renderArCustomerTypeahead(localMatches, query);
      }
    }
  }, 250);
};

const handleArCustomerSearchKeydown = (e) => {
  const listEl = document.getElementById("ar-customer-typeahead-list");
  const isTypeaheadOpen = listEl && !listEl.classList.contains("d-none");

  if (isTypeaheadOpen && arSearchSuggestions.length > 0) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      arSearchHighlightedIndex = (arSearchHighlightedIndex + 1) % arSearchSuggestions.length;
      updateArCustomerTypeaheadHighlight();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      arSearchHighlightedIndex = (arSearchHighlightedIndex - 1 + arSearchSuggestions.length) % arSearchSuggestions.length;
      updateArCustomerTypeaheadHighlight();
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      e.stopPropagation();
      arSearchHighlightedIndex = 0;
      updateArCustomerTypeaheadHighlight();
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      arSearchHighlightedIndex = arSearchSuggestions.length - 1;
      updateArCustomerTypeaheadHighlight();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (arSearchHighlightedIndex >= 0 && arSearchHighlightedIndex < arSearchSuggestions.length) {
        selectArCustomerSuggestion(arSearchSuggestions[arSearchHighlightedIndex]);
      }
      return;
    }
    if (e.key === "Escape" || e.key === "F8" || e.key === "F9") {
      e.preventDefault();
      e.stopPropagation();
      closeArCustomerTypeahead();
      return;
    }
  } else if (isTypeaheadOpen && arSearchSuggestions.length === 0) {
    if (e.key === "Escape" || e.key === "F8" || e.key === "F9") {
      e.preventDefault();
      e.stopPropagation();
      closeArCustomerTypeahead();
      return;
    }
  }

  // If typeahead closed:
  if (e.key === "ArrowDown") {
    e.preventDefault();
    e.stopPropagation();
    renderArCustomerTypeahead(arCustomers.slice(0, 10), "");
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    focusBarcodeInput();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    const query = (e.target.value || "").trim().toLowerCase();
    if (query) {
      const match = arCustomers.find(c =>
        String(c.customer_name || "").toLowerCase().includes(query) ||
        String(c.ar_customer_id || "") === query ||
        String(c.contact_phone || "").toLowerCase().includes(query)
      );
      if (match) {
        selectArCustomerSuggestion(match);
        return;
      }
    }
    focusBarcodeInput();
    return;
  }
};

/* ==========================================================================
   Discount Modal Subsystem (FIX 1 & FIX 2)
   ========================================================================== */
let preDiscountModalFocus = null;
let currentDiscountModalPhase = 1; // 1: Type selection, 2: ID entry
let pendingDiscountType = null; // 'senior' or 'pwd'
let selectedDiscountTypeIndex = 0; // index in visible options

const getVisibleDiscountOptions = () => {
  const currentDt = (document.getElementById("discount_type")?.value || "none").toLowerCase();
  const noneOpt = document.getElementById("opt-disc-none");
  if (noneOpt) {
    if (currentDt === "senior" || currentDt === "pwd") {
      noneOpt.classList.remove("d-none");
    } else {
      noneOpt.classList.add("d-none");
    }
  }
  const seniorOpt = document.getElementById("opt-disc-senior");
  const pwdOpt = document.getElementById("opt-disc-pwd");
  const zeroOpt = document.getElementById("opt-disc-zero");
  const opts = [seniorOpt, pwdOpt, zeroOpt];
  if (currentDt === "senior" || currentDt === "pwd") {
    opts.push(noneOpt);
  }
  return opts.filter(Boolean);
};

const highlightDiscountOption = (idx) => {
  const options = getVisibleDiscountOptions();
  if (options.length === 0) return;
  selectedDiscountTypeIndex = Math.max(0, Math.min(idx, options.length - 1));
  options.forEach((opt, i) => {
    if (i === selectedDiscountTypeIndex) {
      opt.classList.add("active");
      opt.setAttribute("aria-selected", "true");
      setSpatialFocus(opt);
      opt.focus();
    } else {
      opt.classList.remove("active");
      opt.setAttribute("aria-selected", "false");
    }
  });
};

const switchToDiscountTypePhase = () => {
  currentDiscountModalPhase = 1;
  pendingDiscountType = null;
  const p1 = document.getElementById("discount-phase-type");
  const p2 = document.getElementById("discount-phase-id");
  const hint = document.getElementById("discount-footer-hint");
  if (p1) p1.classList.remove("d-none");
  if (p2) p2.classList.add("d-none");
  if (hint) {
    hint.innerHTML = '<kbd>↑</kbd>/<kbd>↓</kbd> Navigate &nbsp;|&nbsp; <kbd>Enter</kbd> Select';
  }
  const currentDt = (document.getElementById("discount_type")?.value || "none").toLowerCase();
  let defaultIdx = 0;
  if (currentDt === "pwd") defaultIdx = 1;
  highlightDiscountOption(defaultIdx);
};

const switchToDiscountIdPhase = (type) => {
  currentDiscountModalPhase = 2;
  pendingDiscountType = type;
  const p1 = document.getElementById("discount-phase-type");
  const p2 = document.getElementById("discount-phase-id");
  const hint = document.getElementById("discount-footer-hint");
  if (p1) p1.classList.add("d-none");
  if (p2) p2.classList.remove("d-none");
  if (hint) {
    hint.innerHTML = '<kbd>Enter</kbd> Apply';
  }
  const badge = document.getElementById("discount-selected-type-badge");
  const label = document.getElementById("discount-modal-id-label");
  const idInput = document.getElementById("discount-modal-id-input");
  const errEl = document.getElementById("discount-modal-id-error");

  if (badge) {
    badge.textContent = type === "senior" ? "Senior Citizen" : "PWD ";
    badge.className = `badge ${type === "senior" ? "bg-primary" : "bg-info text-dark"} fs-6 px-2 py-1`;
  }
  if (label) {
    label.textContent = type === "senior" ? "Senior Citizen OSCA ID No. :" : "PWD ID No. :";
  }
  if (errEl) errEl.classList.add("d-none");

  const currentDt = (document.getElementById("discount_type")?.value || "none").toLowerCase();
  const currentId = document.getElementById("discount_id_number")?.value || "";
  if (idInput) {
    idInput.value = currentDt === type ? currentId : "";
    setSpatialFocus(idInput);
    idInput.focus();
    idInput.select();
  }
};

let isDiscountModalOpening = false;
const openDiscountModal = () => {
  const modalEl = document.getElementById("discount-selection-modal");
  if (!modalEl) return;
  if (modalEl.classList.contains("show") || isDiscountModalOpening) return;
  if (isAnyModalOpen()) return;

  isDiscountModalOpening = true;
  preDiscountModalFocus = document.activeElement || document.getElementById("btn-open-discount-modal");
  switchToDiscountTypePhase();

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: "static", keyboard: false });
  modal.show();

  const focusOption = () => {
    isDiscountModalOpening = false;
    highlightDiscountOption(selectedDiscountTypeIndex);
  };
  modalEl.addEventListener("shown.bs.modal", focusOption, { once: true });
  setTimeout(focusOption, 50);
  setTimeout(focusOption, 150);
  setTimeout(focusOption, 300);
};

const closeDiscountModal = () => {
  isDiscountModalOpening = false;
  const modalEl = document.getElementById("discount-selection-modal");
  if (modalEl) {
    bootstrap.Modal.getOrCreateInstance(modalEl).hide();
  }
  currentDiscountModalPhase = 1;
  pendingDiscountType = null;
  if (preDiscountModalFocus && document.body.contains(preDiscountModalFocus)) {
    setSpatialFocus(preDiscountModalFocus);
    preDiscountModalFocus.focus();
  } else {
    const btn = document.getElementById("btn-open-discount-modal");
    if (btn && isElementVisible(btn)) {
      setSpatialFocus(btn);
      btn.focus();
    } else {
      focusBarcodeInput();
    }
  }
};

const applyStatutoryDiscountFromModal = () => {
  if (!pendingDiscountType) return;
  const idInput = document.getElementById("discount-modal-id-input");
  const rawId = (idInput?.value || "").trim();
  const errEl = document.getElementById("discount-modal-id-error");

  if (!rawId) {
    if (errEl) {
      errEl.textContent = `A valid ${pendingDiscountType === "senior" ? "Senior OSCA" : "PWD"} ID number is required by BIR regulations.`;
      errEl.classList.remove("d-none");
    }
    idInput?.focus();
    return;
  }

  const dtEl = document.getElementById("discount_type");
  const idEl = document.getElementById("discount_id_number");
  const customModeEl = document.getElementById("custom_discount_mode");
  const customValEl = document.getElementById("custom_discount_value");

  if (dtEl) dtEl.value = pendingDiscountType;
  if (idEl) idEl.value = rawId;
  if (customModeEl) customModeEl.value = "percent";
  if (customValEl) customValEl.value = "0";

  updateDiscountUI();
  showScanFeedback(`Applied ${pendingDiscountType === "senior" ? "Senior Citizen" : "PWD"} discount (20% + VAT Exempt).`);
  closeDiscountModal();
};

const removeDiscountAndClose = () => {
  const dtEl = document.getElementById("discount_type");
  const idEl = document.getElementById("discount_id_number");
  const customValEl = document.getElementById("custom_discount_value");

  if (dtEl) dtEl.value = "none";
  if (idEl) idEl.value = "";
  if (customValEl) customValEl.value = "0";

  updateDiscountUI();
  showScanFeedback("Discount removed. Standard totals restored.");
  closeDiscountModal();
};

const handleNoDiscountSelection = () => {
  const currentDt = (document.getElementById("discount_type")?.value || "none").toLowerCase();
  if (currentDt === "senior" || currentDt === "pwd" || currentDt === "custom") {
    removeDiscountAndClose();
  } else {
    closeDiscountModal();
    showScanFeedback("No discount applied (standard price).");
  }
};

const openDiscountKeyboardFlow = () => {
  openDiscountModal();
};

const cancelDiscountKeyboardFlow = () => {
  closeDiscountModal();
};

/* ==========================================================================
   Sales History & Cashier Views (Recent Sales & Receipts Reprint)
   ========================================================================== */

const switchPosView = (viewId) => {
  document.querySelectorAll(".pos-view").forEach((v) => v.classList.add("d-none"));
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.remove("d-none");
  }

  if (viewId === "view-checkout") {
    document.body.classList.add("pos-terminal-active");
    focusBarcodeInput();
  } else {
    document.body.classList.remove("pos-terminal-active");
    if (viewId === "view-recent-sales") {
      loadSales();
    } else if (viewId === "view-receipts") {
      loadReceiptsArchive();
    }
  }
};

const loadSales = async () => {
  try {
    const { data } = await axios.get(apiUrl, { params: { operation: "getAllSales" } });
    allSalesData = data || [];
    renderSalesTable(allSalesData);
  } catch (err) {
    console.error(err);
  }
};

const filterRecentSales = () => {
  const query = (document.getElementById("sales-search-filter")?.value || "").toLowerCase().trim();
  if (!query) {
    renderSalesTable(allSalesData);
    return;
  }
  const filtered = allSalesData.filter((s) => {
    return (
      String(s.sale_id).toLowerCase().includes(query) ||
      String(s.customer_name || "").toLowerCase().includes(query) ||
      String(s.cashier || "").toLowerCase().includes(query) ||
      String(s.terminal_name || "").toLowerCase().includes(query) ||
      String(s.payment_method || "").toLowerCase().includes(query) ||
      String(s.sale_type || "").toLowerCase().includes(query)
    );
  });
  renderSalesTable(filtered);
};

let salesSortDirection = "desc";

const renderSalesTable = (records) => {
  const tableDiv = document.getElementById("sales-table");
  if (!tableDiv) return;

  const sorted = [...records].sort((a, b) => {
    const idA = Number(a.sale_id || 0);
    const idB = Number(b.sale_id || 0);
    return salesSortDirection === "desc" ? idB - idA : idA - idB;
  });

  tableDiv.innerHTML = sorted.length
    ? `
    <table class="table table-hover table-striped table-sm mb-0 align-middle">
      <thead class="table-light">
        <tr>
          <th id="th-sales-id" style="cursor: pointer; user-select: none;" title="Click to sort by Receipt #">
            RECEIPT # <span class="sort-icon">${salesSortDirection === "desc" ? "▼" : "▲"}</span>
          </th>
          <th>DATE &amp; TIME</th>
          <th>TYPE</th>
          <th>CUSTOMER</th>
          <th>TERMINAL</th>
          <th>CASHIER</th>
          <th>PAYMENT TENDER</th>
          <th class="text-end">TOTAL</th>
          <th class="text-center">ACTION</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
      .map(
        (sale) => `
          <tr>
            <td class="font-monospace fw-bold">#${sale.sale_id}</td>
            <td class="small">${escapeHtml(sale.sale_date)}</td>
            <td><span class="badge ${sale.sale_type === "AR" ? "bg-warning text-dark" : "bg-success"}">${sale.sale_type || ""}</span></td>
            <td class="fw-semibold">${escapeHtml(sale.customer_name || "Walk-in Cash")}</td>
            <td class="small">${escapeHtml(sale.terminal_name)}</td>
            <td class="small">${escapeHtml(sale.cashier)}</td>
            <td class="small">${escapeHtml(sale.payment_method || (sale.sale_type === "AR" ? "AR Credit" : "Cash"))}</td>
            <td class="text-end font-monospace fw-bold">₱${Number(sale.total_amount || 0).toFixed(2)}</td>
            <td class="text-center">
              <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" data-receipt="${sale.sale_id}">
                Receipt
              </button>
            </td>
          </tr>`
      )
      .join("")}
      </tbody>
    </table>`
    : '<p class="text-muted p-4 mb-0 text-center">No completed sales recorded for this register.</p>';

  document.getElementById("th-sales-id")?.addEventListener("click", () => {
    salesSortDirection = salesSortDirection === "desc" ? "asc" : "desc";
    renderSalesTable(records);
  });

  tableDiv.querySelectorAll("[data-receipt]").forEach((btn) => {
    btn.addEventListener("click", () => showReceipt(btn.dataset.receipt));
  });
};

/* ==========================================================================
   Receipts & Shift EOS Reports Reprint Archive (WP-1)
   ========================================================================== */

const switchArchiveMode = async (mode) => {
  selectedArchiveMode = mode === "eos" ? "eos" : "sales";
  const salesBtn = document.getElementById("btn-archive-mode-sales");
  const eosBtn = document.getElementById("btn-archive-mode-eos");
  const lookupInput = document.getElementById("receipt-lookup-id");
  const pane = document.getElementById("receipt-preview-pane");
  const reprintBtn = document.getElementById("btn-reprint-receipt");

  if (salesBtn) {
    salesBtn.classList.toggle("active", selectedArchiveMode === "sales");
    salesBtn.classList.toggle("btn-primary", selectedArchiveMode === "sales");
    salesBtn.classList.toggle("btn-outline-primary", selectedArchiveMode !== "sales");
  }
  if (eosBtn) {
    eosBtn.classList.toggle("active", selectedArchiveMode === "eos");
    eosBtn.classList.toggle("btn-primary", selectedArchiveMode === "eos");
    eosBtn.classList.toggle("btn-outline-primary", selectedArchiveMode !== "eos");
  }
  if (lookupInput) {
    lookupInput.value = "";
    lookupInput.placeholder = selectedArchiveMode === "eos"
      ? "Search Shift #, Cashier, Terminal..."
      : "Search Receipt #, Customer, or Date...";
  }
  if (pane) {
    pane.innerHTML = `<div class="text-center text-muted py-5">${selectedArchiveMode === "eos"
      ? "Select a closed shift on the left to preview &amp; reprint its End-of-Shift (EOS) Report."
      : "Select a completed sale on the left to preview &amp; reprint its receipt."
      }</div>`;
  }
  if (reprintBtn) reprintBtn.disabled = true;

  await loadReceiptsArchive();
};

const loadReceiptsArchive = async () => {
  if (selectedArchiveMode === "eos") {
    try {
      const { data } = await axios.get(apiUrl, { params: { operation: "getClosedShifts" }, withCredentials: true });
      closedShiftsData = Array.isArray(data) ? data : (Array.isArray(data?.shifts) ? data.shifts : []);
    } catch (e) {
      console.error(e);
      closedShiftsData = [];
    }
    renderEosArchiveList(closedShiftsData);
    return;
  }

  if (!allSalesData.length) {
    try {
      const { data } = await axios.get(apiUrl, { params: { operation: "getAllSales" } });
      allSalesData = data || [];
    } catch (e) {
      console.error(e);
    }
  }
  renderReceiptHistoryList(allSalesData);
};

const renderEosArchiveList = (records) => {
  const listEl = document.getElementById("receipt-history-list");
  if (!listEl) return;

  if (!records.length) {
    listEl.innerHTML = '<div class="list-group-item text-muted text-center py-3">No closed shift EOS reports found.</div>';
    return;
  }

  listEl.innerHTML = records
    .map((sh) => {
      const isSelected = selectedClosedShiftId && String(selectedClosedShiftId) === String(sh.shift_id);
      const variance = Number(sh.variance_amount || 0);
      const varBadgeClass = Math.abs(variance) < 0.005 ? "bg-success" : (variance > 0 ? "bg-info text-dark" : "bg-danger");
      const varLabel = Math.abs(variance) < 0.005 ? "BALANCED" : (variance > 0 ? `OVER +₱${variance.toFixed(2)}` : `SHORT -₱${Math.abs(variance).toFixed(2)}`);
      return `
        <button type="button" class="list-group-item list-group-item-action ${isSelected ? "active" : ""}" data-archive-shift="${sh.shift_id}">
          <div class="d-flex w-100 justify-content-between align-items-center">
            <strong class="font-monospace">Shift #${sh.shift_id}</strong>
            <span class="badge ${varBadgeClass}">${varLabel}</span>
          </div>
          <div class="d-flex w-100 justify-content-between align-items-center mt-1">
            <small class="${isSelected ? "text-white-50" : "text-muted"}">${escapeHtml(sh.cashier_name || "Cashier")} · ${escapeHtml(sh.terminal_name || "Terminal")}</small>
            <strong class="font-monospace">₱${Number(sh.closing_cash || 0).toFixed(2)}</strong>
          </div>
          <small class="${isSelected ? "text-white-50" : "text-muted"} d-block mt-1 font-monospace" style="font-size: 0.75rem;">Closed: ${escapeHtml(sh.closed_at || "")}</small>
        </button>
      `;
    })
    .join("");

  listEl.querySelectorAll("[data-archive-shift]").forEach((btn) => {
    btn.addEventListener("click", () => {
      loadEosArchivePreview(btn.dataset.archiveShift);
    });
  });
};

const loadEosArchivePreview = (shiftId) => {
  selectedClosedShiftId = shiftId;
  renderEosArchiveList(closedShiftsData);
  const shift = closedShiftsData.find((s) => String(s.shift_id) === String(shiftId));
  const pane = document.getElementById("receipt-preview-pane");
  const reprintBtn = document.getElementById("btn-reprint-receipt");
  if (!pane || !shift) return;

  const summary = shift.summary || {
    shift_id: shift.shift_id,
    cashier_name: shift.cashier_name,
    terminal_name: shift.terminal_name,
    opened_at: shift.opened_at,
    closed_at: shift.closed_at,
    starting_balance: Number(shift.opening_cash || 0),
    floats_added_total: Number(shift.floats_added_total || 0),
    current_float: Number(shift.current_float || shift.opening_cash || 0),
    cash_sales_total: Number(shift.cash_sales_total || 0),
    refunds_total: Number(shift.refunds_total || 0),
    lifts_total: Number(shift.lifts_total || 0),
    expected_cash_in_hand: Number(shift.expected_cash || 0),
    ar_sales_count: Number(shift.ar_sales_count || 0),
    ar_sales_total: Number(shift.ar_sales_total || 0),
    actual_counted_cash: Number(shift.closing_cash || 0),
    variance_amount: Number(shift.variance_amount || 0),
    supervisor_name: shift.supervisor_name || "Supervisor"
  };

  pane.innerHTML = renderEosReportSlipHtml(summary, true);
  if (reprintBtn) reprintBtn.disabled = false;
};

const renderReceiptHistoryList = (records) => {
  const listEl = document.getElementById("receipt-history-list");
  if (!listEl) return;

  if (!records.length) {
    listEl.innerHTML = '<div class="list-group-item text-muted text-center py-3">No transactions found.</div>';
    return;
  }

  listEl.innerHTML = records
    .map((s) => {
      const isAr = s.sale_type === "AR";
      const isSelected = selectedReceiptSaleId && String(selectedReceiptSaleId) === String(s.sale_id);
      return `
        <button type="button" class="list-group-item list-group-item-action ${isSelected ? "active" : ""}" data-archive-sale="${s.sale_id}">
          <div class="d-flex w-100 justify-content-between align-items-center">
            <strong class="font-monospace">Receipt #${s.sale_id}</strong>
            <span class="badge ${isAr ? "bg-warning text-dark" : "bg-success"}">${s.sale_type}</span>
          </div>
          <div class="d-flex w-100 justify-content-between align-items-center mt-1">
            <small class="${isSelected ? "text-white-50" : "text-muted"}">${escapeHtml(s.customer_name || "Walk-in Cash")}</small>
            <strong class="font-monospace">P${Number(s.total_amount || 0).toFixed(2)}</strong>
          </div>
          <small class="${isSelected ? "text-white-50" : "text-muted"} d-block mt-1 font-monospace" style="font-size: 0.75rem;">${s.sale_date}</small>
        </button>
      `;
    })
    .join("");

  listEl.querySelectorAll("[data-archive-sale]").forEach((btn) => {
    btn.addEventListener("click", () => {
      loadReceiptPreview(btn.dataset.archiveSale);
    });
  });
};

const filterReceiptHistory = () => {
  const query = (document.getElementById("receipt-lookup-id")?.value || "").toLowerCase().trim();
  if (selectedArchiveMode === "eos") {
    if (!query) {
      renderEosArchiveList(closedShiftsData);
      return;
    }
    const filteredShifts = closedShiftsData.filter((sh) => {
      return (
        String(sh.shift_id).toLowerCase().includes(query) ||
        String(sh.cashier_name || "").toLowerCase().includes(query) ||
        String(sh.terminal_name || "").toLowerCase().includes(query) ||
        String(sh.closed_at || "").toLowerCase().includes(query)
      );
    });
    renderEosArchiveList(filteredShifts);
    return;
  }

  if (!query) {
    renderReceiptHistoryList(allSalesData);
    return;
  }
  const filtered = allSalesData.filter((s) => {
    return (
      String(s.sale_id).includes(query) ||
      String(s.customer_name || "").toLowerCase().includes(query) ||
      String(s.sale_date || "").toLowerCase().includes(query)
    );
  });
  renderReceiptHistoryList(filtered);
};

const loadReceiptPreview = async (saleId) => {
  try {
    selectedReceiptSaleId = saleId;
    renderReceiptHistoryList(allSalesData);

    const { data } = await axios.get(apiUrl, { params: { operation: "getReceipt", saleId } });
    const pane = document.getElementById("receipt-preview-pane");
    const reprintBtn = document.getElementById("btn-reprint-receipt");
    if (!pane) return;

    const sale = data.sale;
    const isAr = sale.sale_type === "AR";
    const slipTitle = isAr ? "AR CREDIT CHARGE SLIP" : "CASH SALE SLIP";
    const sukiPoints = sale.suki_points_balance === null ? "" : `SUKI Points: ${Number(sale.suki_points_balance).toFixed(0)}<br>`;
    const sukiStatus = sale.suki_card_status && sale.suki_card_status !== "None" ? `SUKI Card: ${sale.suki_card_number || "Cardholder"}<br>${sukiPoints}` : "";
    const customer = isAr && sale.customer_name ? `Customer: ${escapeHtml(sale.customer_name)}<br>` : "";
    const arInvoiceMeta = isAr && sale.due_date ? `Invoice #: ${escapeHtml(sale.invoice_number || ("INV-" + String(sale.sale_id).padStart(8, "0")))}<br>Due Date: ${escapeHtml(sale.due_date)}<br>` : "";
    const paymentMethod = escapeHtml(sale.payment_method || (isAr ? "AR Credit" : "Cash"));

    pane.innerHTML = `
      <div id="reprint-slip-content" class="pos-receipt-slip">
        <div class="text-center mb-2">
          <div class="fw-bold fs-6">${slipTitle}</div>
          <div class="small text-muted">POS &amp; AR Master Files System</div>
          <div class="small text-muted font-monospace">*** REPRINT / ARCHIVE COPY ***</div>
        </div>
        <hr class="my-2" />
        <div class="small font-monospace mb-2">
          Receipt #: ${sale.sale_id}<br>
          Date: ${sale.sale_date}<br>
          Terminal: ${escapeHtml(sale.terminal_name)}<br>
          Cashier: ${escapeHtml(sale.cashier)}<br>
          ${customer}${arInvoiceMeta}Payment: ${paymentMethod}<br>
          ${sukiStatus}
        </div>
        <hr class="my-2" />
        <table class="w-100 small font-monospace mb-2">
          ${data.items
        .map(
          (item) => `
            <tr>
              <td class="py-1">
                ${escapeHtml(item.product_name)} x ${item.quantity}
                ${Number(item.promo_discount || 0) > 0 ? `<br><small class="text-success">${escapeHtml(item.promo_name || "Promo")}: -₱${Number(item.promo_discount).toFixed(2)}</small>` : ""}
              </td>
              <td class="text-end py-1 align-top">₱${Number(item.line_total).toFixed(2)}</td>
            </tr>`
        )
        .join("")}
        </table>
        <hr class="my-2" />
        ${(() => {
        const promoSavings = data.items.reduce((sum, it) => sum + Number(it.promo_discount || 0), 0);
        return promoSavings > 0 ? `
          <div class="d-flex justify-content-between small font-monospace text-success">
            <span>Promo Savings:</span>
            <span>-₱${promoSavings.toFixed(2)}</span>
          </div>` : "";
      })()}
        ${(() => {
        const dt = (sale.discount_type || "none").toLowerCase();
        const isStat = dt === "senior" || dt === "pwd";
        const vatable = isStat ? 0 : Number(sale.price ?? (Number(sale.total_amount) / 1.12));
        const vatExemptSales = Number(sale.vat_exempt_sales || 0);
        const vatExemptAmt = Number(sale.vat_exempt_amount || 0);
        const discTotal = Number(sale.discount_total || 0);
        const discId = sale.discount_id_number ? `<div class="d-flex justify-content-between small font-monospace fw-bold"><span>${dt === "senior" ? "SC OSCA ID No.:" : "PWD ID No.:"}</span><span>${escapeHtml(sale.discount_id_number)}</span></div>` : "";
        const discLabel = dt === "senior" ? "Less 20% SC Discount:" : dt === "pwd" ? "Less 20% PWD Discount:" : "Less Custom Discount:";
        return `
            ${discId}
            <div class="d-flex justify-content-between small font-monospace">
              <span>VATable Sales:</span>
              <span>₱${vatable.toFixed(2)}</span>
            </div>
            ${isStat ? `
            <div class="d-flex justify-content-between small font-monospace">
              <span>VAT-Exempt Sales:</span>
              <span>₱${vatExemptSales.toFixed(2)}</span>
            </div>` : ""}
            <div class="d-flex justify-content-between small font-monospace">
              <span>VAT Amount (12%):</span>
              <span>₱${Number(sale.tax_total || 0).toFixed(2)}</span>
            </div>
            ${vatExemptAmt > 0 ? `
            <div class="d-flex justify-content-between small font-monospace text-success">
              <span>Less 12% VAT (Exempt):</span>
              <span>-₱${vatExemptAmt.toFixed(2)}</span>
            </div>` : ""}
            ${discTotal > 0 ? `
            <div class="d-flex justify-content-between small font-monospace text-danger fw-bold">
              <span>${discLabel}</span>
              <span>-₱${discTotal.toFixed(2)}</span>
            </div>` : ""}
          `;
      })()}
        <div class="d-flex justify-content-between fw-bold font-monospace fs-6 mt-1">
          <span>TOTAL DUE:</span>
          <span>₱${Number(sale.total_amount).toFixed(2)}</span>
        </div>
        ${isAr ? `
          <div class="small mt-2 p-1 bg-light border text-center font-monospace">
            CHARGED TO CUSTOMER AR ACCOUNT
          </div>` : ""}
        <div class="text-center mt-3 small text-muted font-monospace">
          --- END OF REPRINT SLIP ---
        </div>
      </div>
    `;

    if (reprintBtn) reprintBtn.disabled = false;
  } catch (err) {
    console.error(err);
    showError("Unable to load receipt preview.");
  }
};

const reprintSelectedReceipt = () => {
  const slipContent = document.getElementById("reprint-slip-content");
  if (!slipContent) return;
  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html>
      <head>
        <title>Reprint Receipt</title>
        <style>
          body { font-family: "Courier New", Courier, monospace; padding: 20px; }
          .pos-receipt-slip { max-width: 380px; margin: auto; }
          hr { border-top: 1px dashed #64748b; }
          table { width: 100%; }
          .text-end { text-align: right; }
          .text-center { text-align: center; }
          .fw-bold { font-weight: bold; }
          .d-flex { display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        ${slipContent.outerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
};

/* ==========================================================================
   Receipt Modal Subsystem (Print & Close Keyboard & Mouse Controls)
   ========================================================================== */
let selectedReceiptButtonIndex = 0; // Default to 0 (Print Receipt)
let isPrintingReceipt = false;
let isReceiptActionInProgress = false;

const getReceiptModalButtons = () => {
  return [
    document.getElementById("btn-print-receipt"),
    document.getElementById("btn-close-receipt"),
  ].filter(Boolean);
};

const highlightReceiptButton = (idx) => {
  const buttons = getReceiptModalButtons();
  if (buttons.length === 0) return;
  selectedReceiptButtonIndex = Math.max(0, Math.min(idx, buttons.length - 1));
  buttons.forEach((btn, i) => {
    if (i === selectedReceiptButtonIndex) {
      setSpatialFocus(btn);
      btn.focus();
    } else {
      btn.classList.remove("kb-focus");
    }
  });
};

const handleReceiptPrintClick = () => {
  if (isPrintingReceipt) return;
  isPrintingReceipt = true;
  setTimeout(() => { isPrintingReceipt = false; }, 800);

  const contentEl = document.getElementById("printable-receipt");
  if (!contentEl) return;
  const content = contentEl.innerHTML;

  try {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print Receipt</title>
            <style>
              body { font-family: "Courier New", Courier, monospace; padding: 20px; }
              .pos-receipt-slip { max-width: 380px; margin: auto; }
              hr { border-top: 1px dashed #64748b; }
              table { width: 100%; }
              .text-end { text-align: right; }
              .text-center { text-align: center; }
              .fw-bold { font-weight: bold; }
              .d-flex { display: flex; justify-content: space-between; }
            </style>
          </head>
          <body>
            ${content}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    } else {
      window.print();
    }
  } catch (e) {
    console.warn("Print window open blocked, falling back to window.print()", e);
    window.print();
  }

  const printBtn = document.getElementById("btn-print-receipt");
  if (printBtn) {
    setSpatialFocus(printBtn);
    printBtn.focus();
  }
};

const closeReceiptModal = () => {
  const modalEl = document.getElementById("receipt-modal");
  if (modalEl) {
    bootstrap.Modal.getOrCreateInstance(modalEl).hide();
  }
  focusBarcodeInput();
};

const showReceipt = async (saleId) => {
  try {
    const { data } = await axios.get(apiUrl, { params: { operation: "getReceipt", saleId } });
    const sale = data.sale;
    const isAr = sale.sale_type === "AR";
    const slipTitle = isAr ? "AR CREDIT CHARGE SLIP" : "CASH SALE SLIP";
    const sukiPoints = sale.suki_points_balance === null ? "" : `<br>SUKI Points: ${Number(sale.suki_points_balance).toFixed(0)}`;
    const sukiStatus = sale.suki_card_status || "None";
    const sukiCardNumber = sale.suki_card_number ? `<br>SUKI Card Number: ${sale.suki_card_number}` : "";
    const customer = isAr && sale.customer_name ? `<br>Customer: ${escapeHtml(sale.customer_name)}` : "";
    const arInvoiceMeta = isAr && sale.due_date ? `<br>Invoice #: ${escapeHtml(sale.invoice_number || ("INV-" + String(sale.sale_id).padStart(8, "0")))}<br>Due Date: ${escapeHtml(sale.due_date)}` : "";
    const paymentMethod = escapeHtml(sale.payment_method || (isAr ? "AR Credit" : "Cash"));

    document.getElementById("receipt-content").innerHTML = `
      <div id="printable-receipt" class="pos-receipt-slip" style="max-width: 380px; margin: auto;">
        <div class="text-center mb-3">
          <h5 class="fw-bold mb-0">${slipTitle}</h5>
          <small class="text-muted">POS &amp; AR Master Files System</small>
        </div>
        <p class="small mb-2 font-monospace">
          Receipt #${sale.sale_id}<br>
          Date: ${sale.sale_date}<br>
          Cashier: ${escapeHtml(sale.cashier)}${customer}${arInvoiceMeta}<br>
          Terminal: ${escapeHtml(sale.terminal_name)}<br>
          Payment: ${paymentMethod}<br>
          SUKI Status: ${sukiStatus}${sukiCardNumber}${sukiPoints}
        </p>
        <hr class="my-2" />
        <table class="table table-sm table-borderless small mb-2 font-monospace">
          ${data.items
        .map(
          (item) => `
            <tr>
              <td>
                ${escapeHtml(item.product_name)} x ${item.quantity}
                ${Number(item.promo_discount || 0) > 0 ? `<br><small class="text-success">${escapeHtml(item.promo_name || "Promo")}: -₱${Number(item.promo_discount).toFixed(2)}</small>` : ""}
              </td>
              <td class="text-end font-monospace">₱${Number(item.line_total).toFixed(2)}</td>
            </tr>`
        )
        .join("")}
        </table>
        <hr class="my-2" />
        ${(() => {
        const promoSavings = data.items.reduce((sum, it) => sum + Number(it.promo_discount || 0), 0);
        return promoSavings > 0 ? `
          <div class="d-flex justify-content-between small font-monospace text-success">
            <span>Promo Savings:</span>
            <span>-₱${promoSavings.toFixed(2)}</span>
          </div>` : "";
      })()}
        ${(() => {
        const dt = (sale.discount_type || "none").toLowerCase();
        const isStat = dt === "senior" || dt === "pwd";
        const vatable = isStat ? 0 : Number(sale.price ?? (Number(sale.total_amount) / 1.12));
        const vatExemptSales = Number(sale.vat_exempt_sales || 0);
        const vatExemptAmt = Number(sale.vat_exempt_amount || 0);
        const discTotal = Number(sale.discount_total || 0);
        const discId = sale.discount_id_number ? `<div class="d-flex justify-content-between small font-monospace fw-bold"><span>${dt === "senior" ? "SC OSCA ID No.:" : "PWD ID No.:"}</span><span>${escapeHtml(sale.discount_id_number)}</span></div>` : "";
        const discLabel = dt === "senior" ? "Less 20% SC Discount:" : dt === "pwd" ? "Less 20% PWD Discount:" : "Less Custom Discount:";
        return `
            ${discId}
            <div class="d-flex justify-content-between small font-monospace">
              <span>VATable Sales:</span>
              <span>₱${vatable.toFixed(2)}</span>
            </div>
            ${isStat ? `
            <div class="d-flex justify-content-between small font-monospace">
              <span>VAT-Exempt Sales:</span>
              <span>₱${vatExemptSales.toFixed(2)}</span>
            </div>` : ""}
            <div class="d-flex justify-content-between small font-monospace">
              <span>VAT Amount (12%):</span>
              <span>₱${Number(sale.tax_total || 0).toFixed(2)}</span>
            </div>
            ${vatExemptAmt > 0 ? `
            <div class="d-flex justify-content-between small font-monospace text-success">
              <span>Less 12% VAT (Exempt):</span>
              <span>-₱${vatExemptAmt.toFixed(2)}</span>
            </div>` : ""}
            ${discTotal > 0 ? `
            <div class="d-flex justify-content-between small font-monospace text-danger fw-bold">
              <span>${discLabel}</span>
              <span>-₱${discTotal.toFixed(2)}</span>
            </div>` : ""}
          `;
      })()}
        <div class="d-flex justify-content-between fw-bold fs-6 mt-1 font-monospace">
          <span>TOTAL:</span>
          <span>₱${Number(sale.total_amount).toFixed(2)}</span>
        </div>
        ${isAr ? `
          <div class="small mt-2 p-1 bg-light border text-center font-monospace">
            CHARGED TO CUSTOMER AR ACCOUNT
          </div>` : ""}
        <div class="text-center mt-3 text-muted small font-monospace">
          <p class="mb-0">Thank you for your purchase!</p>
        </div>
      </div>`;

    const modalEl = document.getElementById("receipt-modal");
    if (modalEl) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
      selectedReceiptButtonIndex = 0; // Default focus on "Print Receipt"
      const focusDefault = () => {
        highlightReceiptButton(selectedReceiptButtonIndex);
      };
      modalEl.addEventListener("shown.bs.modal", focusDefault, { once: true });
      setTimeout(focusDefault, 50);
      setTimeout(focusDefault, 150);
      setTimeout(focusDefault, 300);
    }
  } catch (err) {
    console.error(err);
    showError("Unable to fetch receipt.");
  }
};

/* ==========================================================================
   Hold & Resume Transaction Management (Task 9)
   ========================================================================== */
const updateHeldTransactionsBadge = async () => {
  try {
    const { data } = await axios.get(apiUrl, { params: { operation: "getHeldTransactions" }, withCredentials: true });
    allHeldTransactions = Array.isArray(data) ? data : [];
    filteredHeldTransactions = [...allHeldTransactions];
    const badge = document.getElementById("held-count-badge");
    if (badge) {
      if (allHeldTransactions.length > 0) {
        badge.textContent = allHeldTransactions.length;
        badge.classList.remove("d-none");
      } else {
        badge.classList.add("d-none");
      }
    }
  } catch (err) {
    console.error("Unable to load held transactions count", err);
  }
};

const triggerHoldTransaction = async () => {
  if (currentShiftId === null && currentUser?.role_name === "Cashier") {
    showError("Shift not open: Enter opening float before holding a sale.");
    promptBeginningCash();
    return;
  }
  if (!cart.length) {
    showScanFeedback("Cart is empty. Nothing to hold.", true);
    return;
  }
  const totalItems = cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const grandTotalStr = document.getElementById("pos-grand-total")?.textContent || "PHP 0.00";

  const modalEl = document.getElementById("hold-transaction-modal");
  if (!modalEl) {
    await executeHold();
    return;
  }
  const itemCountEl = document.getElementById("hold-item-count");
  const totalAmountEl = document.getElementById("hold-total-amount");
  if (itemCountEl) itemCountEl.textContent = `${totalItems} items (${cart.length} line items)`;
  if (totalAmountEl) totalAmountEl.textContent = grandTotalStr;

  const custSelect = document.getElementById("ar_customer_id");
  const selectedCustomer = custSelect?.value ? arCustomers.find((c) => String(c.ar_customer_id) === custSelect.value) : null;
  const labelInput = document.getElementById("hold-customer-label");
  if (labelInput) {
    labelInput.value = selectedCustomer ? selectedCustomer.customer_name : (activeHoldRef ? `Continuation of ${activeHoldRef}` : `Cart ${new Date().toLocaleTimeString()}`);
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
  setTimeout(() => {
    labelInput?.focus();
    labelInput?.select();
  }, 80);
};

const openHoldModal = () => {
  triggerHoldTransaction();
};

const executeHold = async () => {
  if (!cart.length) return;
  const labelInput = document.getElementById("hold-customer-label");
  const customerLabel = labelInput?.value.trim() || "";

  const holdData = {
    customerLabel,
    saleType: currentSaleMode,
    paymentMethodId: document.getElementById("sale_payment_method_id")?.value || null,
    customerId: document.getElementById("ar_customer_id")?.value || null,
    sukiCardStatus: document.getElementById("suki_card_status")?.value || "None",
    sukiCardId: document.getElementById("suki_card_id")?.value || null,
    sukiPointsBalance: document.getElementById("suki_points_balance")?.value || null,
    taxRate: document.getElementById("tax_rate")?.value || 0,
    discountType: document.getElementById("discount_type")?.value || "none",
    discountIdNumber: document.getElementById("discount_id_number")?.value || "",
    customDiscountMode: document.getElementById("custom_discount_mode")?.value || "percent",
    customDiscountValue: document.getElementById("custom_discount_value")?.value || 0,
    items: cart,
  };

  try {
    const formData = new FormData();
    formData.append("operation", "holdTransaction");
    formData.append("json", JSON.stringify(holdData));

    const { data } = await axios.post(apiUrl, formData, { withCredentials: true });
    if (data.returnValue === 1) {
      bootstrap.Modal.getInstance(document.getElementById("hold-transaction-modal"))?.hide();

      activeHeldId = null;
      activeHoldRef = null;
      document.getElementById("held-sale-status-badge")?.classList.add("d-none");
      closeSale();
      await updateHeldTransactionsBadge();
      showScanFeedback(`Sale held under Ticket ${data.holdReference}. Register cleared for next customer.`);
    } else {
      showError(data.message || "Unable to hold sale.");
    }
  } catch (err) {
    console.error(err);
    showError(err.response?.data?.message || "Failed to hold sale.");
  }
  focusBarcodeInput();
};

const filterHeldTransactions = () => {
  const query = (document.getElementById("held-search-filter")?.value || "").toLowerCase().trim();
  if (!query) {
    filteredHeldTransactions = [...allHeldTransactions];
  } else {
    filteredHeldTransactions = allHeldTransactions.filter((h) => {
      return (
        String(h.hold_reference || "").toLowerCase().includes(query) ||
        String(h.held_id || "").toLowerCase().includes(query) ||
        String(h.customer_label || "").toLowerCase().includes(query) ||
        String(h.sale_type || "").toLowerCase().includes(query) ||
        String(h.total_amount || "").toLowerCase().includes(query)
      );
    });
  }
  activeHeldRecordIndex = 0;
  renderHeldTransactionsList(filteredHeldTransactions);
};

const openResumeModal = async () => {
  const modalEl = document.getElementById("resume-transaction-modal");
  if (!modalEl) return;

  const searchInput = document.getElementById("held-search-filter");
  if (searchInput) searchInput.value = "";

  const listTbody = document.getElementById("held-transactions-list");
  if (listTbody) {
    listTbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Loading held sales...</td></tr>';
  }

  activeHeldRecordIndex = 0;
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  try {
    const { data } = await axios.get(apiUrl, { params: { operation: "getHeldTransactions" }, withCredentials: true });
    allHeldTransactions = Array.isArray(data) ? data : [];
    filteredHeldTransactions = [...allHeldTransactions];
    renderHeldTransactionsList(filteredHeldTransactions);
    const badge = document.getElementById("held-count-badge");
    if (badge) {
      if (allHeldTransactions.length > 0) {
        badge.textContent = allHeldTransactions.length;
        badge.classList.remove("d-none");
      } else {
        badge.classList.add("d-none");
      }
    }
    setTimeout(() => {
      searchInput?.focus();
    }, 80);
  } catch (err) {
    console.error(err);
    if (listTbody) {
      listTbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-3">Failed to load held sales.</td></tr>';
    }
  }
};

const renderHeldTransactionsList = (records) => {
  const listTbody = document.getElementById("held-transactions-list");
  if (!listTbody) return;

  if (!records.length) {
    listTbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No held sales waiting for this cashier/terminal/shift.</td></tr>';
    activeHeldRecordIndex = -1;
    return;
  }

  if (activeHeldRecordIndex < 0 || activeHeldRecordIndex >= records.length) {
    activeHeldRecordIndex = 0;
  }

  listTbody.innerHTML = records
    .map((h, idx) => {
      const isSelected = idx === activeHeldRecordIndex;
      return `
        <tr class="${isSelected ? "table-active pos-row-selected" : ""}" data-held-index="${idx}">
          <td class="font-monospace fw-bold text-primary">${escapeHtml(h.hold_reference)}</td>
          <td class="fw-semibold">${escapeHtml(h.customer_label || "Walk-in")} <span class="badge ${h.sale_type === "AR" ? "bg-warning text-dark" : "bg-secondary"} ms-1">${escapeHtml(h.sale_type || "Cash")}</span></td>
          <td class="small text-muted font-monospace">${escapeHtml(h.created_at)}</td>
          <td class="text-center fw-bold">${h.item_count}</td>
          <td class="text-end font-monospace fw-bold">PHP ${Number(h.total_amount).toFixed(2)}</td>
          <td class="text-center text-nowrap">
            <button type="button" class="btn btn-sm ${isSelected ? "btn-warning text-dark fw-bold" : "btn-primary"} py-0 px-2 resume-action-btn" data-held-id="${h.held_id}" tabindex="-1">
              Recall On-Hold [Enter]
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 ms-1 discard-action-btn" data-held-id="${h.held_id}" title="Discard / Void held sale [Delete]" tabindex="-1">
              &times;
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  const activeRow = listTbody.querySelector(`tr[data-held-index="${activeHeldRecordIndex}"]`);
  activeRow?.scrollIntoView({ block: "nearest" });

  listTbody.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => {
      activeHeldRecordIndex = Number(row.dataset.heldIndex);
      renderHeldTransactionsList(records);
    });
  });

  listTbody.querySelectorAll(".resume-action-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const heldId = Number(btn.dataset.heldId);
      resumeHeldTransaction(heldId);
    });
  });

  listTbody.querySelectorAll(".discard-action-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const heldId = Number(btn.dataset.heldId);
      discardHeldTransaction(heldId);
    });
  });
};

const resumeHeldTransaction = async (heldId) => {
  if (cart.length > 0 && activeHeldId !== heldId) {
    const res = await showConfirm({
      title: "Replace Active Register Cart?",
      text: "Your current active cart will be replaced with this held sale. Continue?",
      confirmButtonText: "Yes, Replace Cart",
      isDestructive: false
    });
    if (!res.isConfirmed) {
      return;
    }
  }

  try {
    const formData = new FormData();
    formData.append("operation", "resumeHeldTransaction");
    formData.append("json", JSON.stringify({ heldId }));
    const { data } = await axios.post(apiUrl, formData, { withCredentials: true });
    if (data.returnValue !== 1 || !data.held) {
      showError(data.message || "Unable to recall on-hold ticket.");
      return;
    }

    bootstrap.Modal.getInstance(document.getElementById("resume-transaction-modal"))?.hide();
    const held = data.held;

    // Restore cart items
    cart = (held.items || []).map((item) => {
      const prod = products.find((p) => Number(p.product_id) === Number(item.productId));
      return {
        productId: Number(item.productId),
        barcode: item.barcode || prod?.barcode || "",
        productName: item.productName || prod?.product_name || "Product",
        unitPrice: Number(item.unitPrice || prod?.price || 0),
        quantity: Number(item.quantity || 1),
        promoId: item.promoId !== undefined && item.promoId !== null ? item.promoId : (prod?.promo_id ? Number(prod.promo_id) : null),
        promoName: item.promoName !== undefined ? item.promoName : (prod?.promo_name || ""),
        promoRate: item.promoRate !== undefined ? Number(item.promoRate) : Number(prod?.promo_rate || 0),
      };
    });
    activeCartIndex = cart.length - 1;
    activeHeldId = null; // Already removed from server-side hold list on resume per WP-3.6
    activeHoldRef = held.hold_reference;

    // Restore cart state fields (mode, customer, payment method, suki card, tax rate, discounts)
    const state = held.cart_state || {};
    if (state.saleType) {
      setSaleMode(state.saleType);
    }
    if (state.paymentMethodId && document.getElementById("sale_payment_method_id")) {
      document.getElementById("sale_payment_method_id").value = state.paymentMethodId;
      syncKeyboardDropdown("sale_payment_method_id");
    }
    if (state.customerId && document.getElementById("ar_customer_id")) {
      document.getElementById("ar_customer_id").value = state.customerId;
      syncKeyboardDropdown("ar_customer_id");
    }
    if (state.sukiCardStatus && document.getElementById("suki_card_status")) {
      document.getElementById("suki_card_status").value = state.sukiCardStatus;
      syncKeyboardDropdown("suki_card_status");
    }
    if (state.sukiCardId && document.getElementById("suki_card_id")) {
      document.getElementById("suki_card_id").value = state.sukiCardId;
      syncKeyboardDropdown("suki_card_id");
    }
    if (state.sukiPointsBalance !== undefined && document.getElementById("suki_points_balance")) {
      document.getElementById("suki_points_balance").value = state.sukiPointsBalance;
    }
    if (state.taxRate !== undefined && document.getElementById("tax_rate")) {
      document.getElementById("tax_rate").value = state.taxRate;
    }
    if (state.discountType !== undefined && document.getElementById("discount_type")) {
      document.getElementById("discount_type").value = state.discountType;
    }
    if (state.discountIdNumber !== undefined && document.getElementById("discount_id_number")) {
      document.getElementById("discount_id_number").value = state.discountIdNumber;
    }
    if (state.customDiscountMode !== undefined && document.getElementById("custom_discount_mode")) {
      document.getElementById("custom_discount_mode").value = state.customDiscountMode;
    }
    if (state.customDiscountValue !== undefined && document.getElementById("custom_discount_value")) {
      document.getElementById("custom_discount_value").value = state.customDiscountValue;
    }

    document.getElementById("held-sale-status-badge")?.classList.remove("d-none");
    updateSaleTypeFields();
    updateSukiFields();
    updateDiscountUI();
    renderCart();
    await updateHeldTransactionsBadge();
    showScanFeedback(`Recalled on-hold ticket ${held.hold_reference}.`);

    if (data.hasStockWarning && Array.isArray(data.stockWarnings) && data.stockWarnings.length > 0) {
      const warnLines = data.stockWarnings.map((w) => w.message).join(" | ");
      const alert = showError(
        `Stock availability changed while this sale was held: ${warnLines}`,
        "Insufficient Stock Warning"
      );
      if (alert?.then) alert.then(focusBarcodeInput);
      else focusBarcodeInput();
      return;
    }

    focusBarcodeInput();
  } catch (err) {
    const msg = err.response?.data?.message || err.message || "Unable to recall on-hold ticket.";
    showError(msg, "On-Hold Blocked");
  }
};

const discardHeldTransaction = async (heldId) => {
  try {
    const formData = new FormData();
    formData.append("operation", "deleteHeldTransaction");
    formData.append("heldId", heldId);
    const { data } = await axios.post(apiUrl, formData, { withCredentials: true });
    if (data.returnValue === 1) {
      if (activeHeldId === heldId) {
        activeHeldId = null;
        activeHoldRef = null;
        document.getElementById("held-sale-status-badge")?.classList.add("d-none");
      }
      allHeldTransactions = allHeldTransactions.filter((h) => Number(h.held_id) !== Number(heldId));
      filteredHeldTransactions = filteredHeldTransactions.filter((h) => Number(h.held_id) !== Number(heldId));
      renderHeldTransactionsList(filteredHeldTransactions);
      updateHeldTransactionsBadge();
      showScanFeedback("Held sale discarded.");
    }
  } catch (err) {
    console.error(err);
    showError("Unable to discard held sale.");
  }
};

/* ==========================================================================
   Revisions: Supervisor Override Authorization Logic
   ========================================================================== */
const requestSupervisorAuth = (actionType, targetRef = "") => {
  return new Promise((resolve, reject) => {
    supervisorAuthResolve = resolve;
    supervisorAuthReject = reject;
    activeSupervisorActionType = actionType;
    activeSupervisorTargetRef = targetRef;

    const modalEl = document.getElementById("supervisor-modal");
    if (!modalEl) {
      reject(new Error("Supervisor modal element missing in page."));
      return;
    }
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    const actionBadge = document.getElementById("supervisor-action-label");
    if (actionBadge) {
      const formattedAction = actionType.replace(/_/g, " ").toUpperCase();
      actionBadge.textContent = `Action: ${formattedAction} ${targetRef ? `[${targetRef}]` : ""}`;
    }

    const userInput = document.getElementById("supervisor-username");
    const passInput = document.getElementById("supervisor-password");
    const errMsg = document.getElementById("supervisor-error-msg");

    if (userInput) userInput.value = "";
    if (passInput) passInput.value = "";
    if (errMsg) {
      errMsg.textContent = "";
      errMsg.classList.add("d-none");
    }

    modal.show();
    setTimeout(() => {
      userInput?.focus();
    }, 150);
  });
};

const handleSupervisorSubmit = async () => {
  const userInput = document.getElementById("supervisor-username");
  const passInput = document.getElementById("supervisor-password");
  const errMsg = document.getElementById("supervisor-error-msg");
  const actionLabel = document.getElementById("supervisor-action-label")?.textContent || "";

  const username = userInput?.value.trim();
  const password = passInput?.value;

  if (!username || !password) {
    if (errMsg) {
      errMsg.textContent = "Please enter both supervisor username and password.";
      errMsg.classList.remove("d-none");
    }
    if (!username) userInput?.focus();
    else passInput?.focus();
    return;
  }

  try {
    const formData = new FormData();
    formData.append("action", "verify_supervisor");
    formData.append("operation", "verify_supervisor");
    formData.append(
      "json",
      JSON.stringify({
        username,
        password,
        action_type: activeSupervisorActionType || actionLabel.replace("Action: ", "").split("[")[0].trim().toLowerCase().replace(/\s+/g, "_"),
        target_reference: activeSupervisorTargetRef || actionLabel,
        shift_id: currentShiftId
      })
    );

    const { data } = await axios.post("api/auth.php?action=verify_supervisor", formData, { withCredentials: true });
    if (data.returnValue === 1 && data.authorized) {
      bootstrap.Modal.getInstance(document.getElementById("supervisor-modal"))?.hide();
      if (supervisorAuthResolve) {
        supervisorAuthResolve(data);
        supervisorAuthResolve = null;
        supervisorAuthReject = null;
      }
    } else {
      if (errMsg) {
        errMsg.textContent = data.message || "Invalid supervisor credentials.";
        errMsg.classList.remove("d-none");
      }
      passInput?.focus();
      passInput?.select();
    }
  } catch (err) {
    if (errMsg) {
      errMsg.textContent = err.response?.data?.message || err.message || "Supervisor verification failed.";
      errMsg.classList.remove("d-none");
    }
    passInput?.focus();
    passInput?.select();
  }
};

const handleSupervisorCancel = () => {
  bootstrap.Modal.getInstance(document.getElementById("supervisor-modal"))?.hide();
  if (supervisorAuthReject) {
    supervisorAuthReject(new Error("Cancelled"));
    supervisorAuthResolve = null;
    supervisorAuthReject = null;
  }
  focusBarcodeInput();
};

/* ==========================================================================
   WP-1: Mandatory Beginning Float & Supervisor-Verified End of Shift (EOS)
   ========================================================================== */
const checkAndPromptShift = async () => {
  try {
    const { data } = await axios.get(apiUrl, {
      params: { operation: "getActiveShift" },
      withCredentials: true
    });
    if (data.minOpeningFloat !== undefined) {
      minOpeningFloat = Math.max(0, Number(data.minOpeningFloat || 0));
      const minNoteEl = document.getElementById("beg-cash-min-note");
      if (minNoteEl) {
        minNoteEl.textContent = `Minimum configured float: ₱${minOpeningFloat.toFixed(2)}`;
      }
    }
    if (data.activeShift && data.activeShift.shift_id) {
      currentShiftId = Number(data.activeShift.shift_id);
      const floatAmt = data.activeShift.current_float !== undefined && data.activeShift.current_float !== null
        ? Number(data.activeShift.current_float)
        : Number(data.activeShift.opening_cash);
      updateShiftBadge(currentShiftId, floatAmt);
      focusBarcodeInput();
    } else {
      currentShiftId = null;
      updateShiftBadge(null, 0);
      promptBeginningCash();
    }
  } catch (err) {
    console.error("Shift check error:", err);
    showError("Unable to verify the active shift.");
    throw err;
  }
};

const closeBeginningCash = () => {
  if (currentShiftId === null && !isAbandoningShiftSession && currentUser?.role_name === "Cashier") {
    return;
  }
  bootstrap.Modal.getInstance(document.getElementById("beginning-cash-modal"))?.hide();
};

const cancelAndLogoutShift = async () => {
  isAbandoningShiftSession = true;
  bootstrap.Modal.getInstance(document.getElementById("beginning-cash-modal"))?.hide();
  await logoutUser();
};

const promptBeginningCash = () => {
  const modalEl = document.getElementById("beginning-cash-modal");
  if (!modalEl) return;

  const titleEl = document.getElementById("begCashModalLabel");
  const confirmBtn = document.getElementById("btn-confirm-beginning-cash");
  const endShiftBtn = document.getElementById("btn-end-shift");
  const minNoteEl = document.getElementById("beg-cash-min-note");

  if (minNoteEl) {
    minNoteEl.textContent = `Minimum configured float: ₱${minOpeningFloat.toFixed(2)}`;
  }

  if (currentShiftId) {
    if (titleEl) {
      titleEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-cash-stack me-2" viewBox="0 0 16 16"><path d="M1 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1zm7 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4"/><path d="M0 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1zm3 0a2 2 0 0 1-2 2v4a2 2 0 0 1 2 2h10a2 2 0 0 1 2-2V7a2 2 0 0 1-2-2z"/></svg>SHIFT #${currentShiftId}: BEGINNING CASH / FUND`;
    }
    if (confirmBtn) confirmBtn.textContent = "UPDATE SHIFT FUND / CONTINUE [Enter]";
    if (endShiftBtn) endShiftBtn.classList.remove("d-none");
  } else {
    if (titleEl) {
      titleEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-cash-stack me-2" viewBox="0 0 16 16"><path d="M1 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1zm7 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4"/><path d="M0 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1zm3 0a2 2 0 0 1-2 2v4a2 2 0 0 1 2 2h10a2 2 0 0 1 2-2V7a2 2 0 0 1-2-2z"/></svg>OPENING SHIFT: BEGINNING CASH`;
    }
    if (confirmBtn) confirmBtn.textContent = "OPEN REGISTER & START SHIFT [Enter]";
    if (endShiftBtn) endShiftBtn.classList.add("d-none");
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl, {
    backdrop: "static",
    keyboard: false
  });
  modal.show();
  const input = document.getElementById("beginning-cash-input");
  if (input) {
    input.value = "";
    input.placeholder = "0.00";
  }
  setTimeout(() => {
    if (input) {
      input.value = "";
      input.placeholder = "0.00";
      setSpatialFocus(input);
      input.focus();
    }
  }, 150);
};

const confirmBeginningCash = async () => {
  const input = document.getElementById("beginning-cash-input");
  const rawVal = String(input?.value ?? "").trim();
  const refocusInput = () => {
    setTimeout(() => {
      if (input) {
        setSpatialFocus(input);
        input.focus();
        input.select();
      }
    }, 60);
  };

  if (!rawVal || !/^\d+(?:\.\d{1,2})?$/.test(rawVal)) {
    const alert = showError(
      `Please enter a valid numeric beginning float (up to 2 decimal places, minimum ₱${minOpeningFloat.toFixed(2)}).`,
      "Invalid Opening Float",
      { returnFocus: false }
    );
    if (alert?.then) alert.then(refocusInput);
    else refocusInput();
    return;
  }

  const amount = Number(rawVal);
  if (!Number.isFinite(amount) || amount < minOpeningFloat) {
    const alert = showError(
      `Beginning float cannot be less than the configured minimum (₱${minOpeningFloat.toFixed(2)}).`,
      "Below Minimum Float",
      { returnFocus: false }
    );
    if (alert?.then) alert.then(refocusInput);
    else refocusInput();
    return;
  }

  try {
    const formData = new FormData();
    formData.append("operation", "openShift");
    formData.append("json", JSON.stringify({ openingCash: amount }));

    const { data } = await axios.post(apiUrl, formData, { withCredentials: true });
    if (data.returnValue === 1 && data.shift) {
      currentShiftId = Number(data.shift.shift_id);
      const floatAmt = data.shift.current_float !== undefined && data.shift.current_float !== null
        ? Number(data.shift.current_float)
        : Number(data.shift.opening_cash);
      updateShiftBadge(currentShiftId, floatAmt);
      bootstrap.Modal.getInstance(document.getElementById("beginning-cash-modal"))?.hide();
      showScanFeedback(`Shift #${currentShiftId} active with ₱${amount.toFixed(2)} beginning cash.`);
      if (currentUser?.role_name === "Cashier") {
        startSale();
      }
      focusBarcodeInput();
      toggleFullscreen().catch(() => { });
    } else {
      const alert = showError(data.message || "Failed to open shift.", "Shift Error", { returnFocus: false });
      if (alert?.then) alert.then(refocusInput);
      else refocusInput();
    }
  } catch (err) {
    const alert = showError(err.response?.data?.message || err.message || "Error opening shift.", "Shift Error", { returnFocus: false });
    if (alert?.then) alert.then(refocusInput);
    else refocusInput();
  }
};

const initiateEndOfShift = async () => {
  if (!currentShiftId) {
    showScanFeedback("No active shift is currently open.", true);
    if (currentUser?.role_name === "Cashier") {
      promptBeginningCash();
    }
    return;
  }
  await updateHeldTransactionsBadge();

  try {
    const auth = await requestSupervisorAuth(
      "end_of_shift",
      `Close & Reconcile Shift #${currentShiftId}`
    );
    pendingEosSupervisorAuth = auth;

    const { data } = await axios.get(apiUrl, {
      params: { operation: "getShiftSummary", shiftId: currentShiftId },
      withCredentials: true
    });

    if (data.returnValue !== 1 || !data.summary) {
      showError(data.message || "Unable to load shift summary for reconciliation.");
      focusBarcodeInput();
      return;
    }

    currentEosSummary = data.summary;
    populateEosCountModal(currentEosSummary, auth.supervisor);

    const eosModalEl = document.getElementById("eos-modal");
    if (eosModalEl) {
      document.getElementById("eos-count-phase")?.classList.remove("d-none");
      document.getElementById("eos-locked-report-phase")?.classList.add("d-none");
      document.getElementById("btn-close-eos-modal")?.classList.remove("d-none");

      const modal = bootstrap.Modal.getOrCreateInstance(eosModalEl, {
        backdrop: "static",
        keyboard: false
      });
      modal.show();

      const actualInput = document.getElementById("eos-actual-cash-input");
      if (actualInput) actualInput.value = "0";
      resetEosVarianceDisplay();
      setTimeout(() => {
        if (actualInput) {
          actualInput.value = "0";
          resetEosVarianceDisplay();
          setSpatialFocus(actualInput);
          actualInput.focus();
          actualInput.select();
        }
      }, 150);
    }
  } catch (err) {
    if (err.message && err.message !== "Cancelled") {
      showError(err.response?.data?.message || err.message || "Supervisor verification required to close shift.");
    } else {
      showScanFeedback("End of Shift cancelled (Supervisor authorization required).", true);
    }
    focusBarcodeInput();
  }
};

const resetEosVarianceDisplay = () => {
  const varBox = document.getElementById("eos-variance-box");
  const varDisplay = document.getElementById("eos-variance-amount");
  const varBadge = document.getElementById("eos-variance-badge");
  if (varDisplay) {
    varDisplay.textContent = "PHP 0.00";
    varDisplay.dataset.variance = "0";
    varDisplay.className = "fs-3 fw-bold font-monospace text-success";
  }
  if (varBadge) {
    varBadge.textContent = "BALANCED (EXACT)";
    varBadge.className = "badge bg-success mt-1";
  }
  if (varBox) {
    varBox.className = "p-3 rounded border text-center my-2 bg-success-subtle border-success";
  }
};

const populateEosCountModal = (summary, supervisor) => {
  const fmt = (val) => `₱${Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setTxt("eos-shift-meta-badge", `Shift #${summary.shift_id}`);
  setTxt("eos-cashier-terminal", `${summary.cashier_name || "Cashier"} / ${summary.terminal_name || "Terminal"}`);
  setTxt("eos-opened-at", summary.opened_at || "---");
  setTxt("eos-supervisor-badge", `Verified: ${supervisor?.name || supervisor?.username || "Supervisor"}`);

  setTxt("eos-starting-balance", fmt(summary.starting_balance));
  setTxt("eos-current-float", fmt(summary.current_float));

  setTxt("eos-comp-opening", `+ ${fmt(summary.starting_balance)}`);
  setTxt("eos-comp-floats", `+ ${fmt(summary.floats_added_total)}`);
  setTxt("eos-comp-sales-count", String(Number(summary.cash_sales_count || 0)));
  setTxt("eos-comp-sales", `+ ${fmt(summary.cash_sales_total)}`);
  setTxt("eos-comp-refunds", `- ${fmt(summary.refunds_total)}`);
  setTxt("eos-comp-lifts", `- ${fmt(summary.lifts_total)}`);
  setTxt("eos-expected-cash", fmt(summary.expected_cash_in_hand));

  setTxt("eos-ar-count", `${Number(summary.ar_sales_count || 0)} transaction(s)`);
  setTxt("eos-ar-total", fmt(summary.ar_sales_total));
  setTxt("eos-cm-count", String(Number(summary.credit_memos_count || 0)));
  setTxt("eos-cm-total", `- ${fmt(summary.credit_memos_total)}`);
  setTxt("eos-dm-count", String(Number(summary.debit_memos_count || 0)));
  setTxt("eos-dm-total", `+ ${fmt(summary.debit_memos_total)}`);
  const netAr = summary.net_ar_posted_total !== undefined
    ? Number(summary.net_ar_posted_total)
    : (Number(summary.ar_sales_total || 0) + Number(summary.debit_memos_total || 0) - Number(summary.credit_memos_total || 0));
  setTxt("eos-net-ar-total", fmt(netAr));
};

const updateEosVarianceLive = () => {
  if (!currentEosSummary) return;
  const actualInput = document.getElementById("eos-actual-cash-input");
  const varBox = document.getElementById("eos-variance-box");
  const varDisplay = document.getElementById("eos-variance-amount");
  const varBadge = document.getElementById("eos-variance-badge");
  if (!actualInput || !varBox || !varDisplay) return;

  const raw = String(actualInput.value ?? "").trim();
  const expected = Math.round(Number(currentEosSummary.expected_cash_in_hand || 0) * 100) / 100;

  if (!raw || !/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    varDisplay.textContent = "ENTER VALID COUNT";
    varDisplay.dataset.variance = "invalid";
    varDisplay.className = "font-monospace fw-bold fs-4 text-warning";
    if (varBadge) {
      varBadge.textContent = "INVALID INPUT";
      varBadge.className = "badge bg-warning text-dark mt-1";
    }
    varBox.className = "p-3 rounded border text-center my-2 bg-warning-subtle border-warning";
    return;
  }

  const actual = Math.round(Number(raw) * 100) / 100;
  const variance = Math.round((actual - expected) * 100) / 100;
  varDisplay.dataset.variance = String(variance);

  if (Math.abs(variance) < 0.005) {
    varDisplay.textContent = "BALANCED (₱0.00)";
    varDisplay.className = "font-monospace fw-bold fs-4 text-success";
    if (varBadge) {
      varBadge.textContent = "BALANCED (EXACT)";
      varBadge.className = "badge bg-success mt-1";
    }
    varBox.className = "p-3 rounded border text-center my-2 bg-success-subtle border-success";
  } else if (variance > 0) {
    varDisplay.textContent = `OVER (+₱${variance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    varDisplay.className = "font-monospace fw-bold fs-4 text-primary";
    if (varBadge) {
      varBadge.textContent = "CASH OVERAGE";
      varBadge.className = "badge bg-primary mt-1";
    }
    varBox.className = "p-3 rounded border text-center my-2 bg-primary-subtle border-primary";
  } else {
    varDisplay.textContent = `SHORT (-₱${Math.abs(variance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    varDisplay.className = "font-monospace fw-bold fs-4 text-danger";
    if (varBadge) {
      varBadge.textContent = "CASH SHORTAGE";
      varBadge.className = "badge bg-danger mt-1";
    }
    varBox.className = "p-3 rounded border text-center my-2 bg-danger-subtle border-danger";
  }
};

const cancelEndOfShift = () => {
  if (isSessionLockedPostEos) return;
  pendingEosSupervisorAuth = null;
  currentEosSummary = null;
  const actualInput = document.getElementById("eos-actual-cash-input");
  if (actualInput) actualInput.value = "0";
  resetEosVarianceDisplay();
  bootstrap.Modal.getInstance(document.getElementById("eos-modal"))?.hide();
  focusBarcodeInput();
};

const confirmEndOfShift = async () => {
  if (!currentShiftId || !pendingEosSupervisorAuth) {
    showError("Supervisor authorization is required to close this shift.");
    return;
  }

  const actualInput = document.getElementById("eos-actual-cash-input");
  const rawVal = String(actualInput?.value ?? "").trim();
  const refocusActual = () => {
    setTimeout(() => {
      if (actualInput) {
        setSpatialFocus(actualInput);
        actualInput.focus();
        actualInput.select();
      }
    }, 60);
  };

  if (!rawVal || !/^\d+(?:\.\d{1,2})?$/.test(rawVal) || Number(rawVal) < 0) {
    const alert = showError(
      "Please enter a valid non-negative numeric amount (up to 2 decimal places) for Actual Counted Cash.",
      "Invalid Counted Cash",
      { returnFocus: false }
    );
    if (alert?.then) alert.then(refocusActual);
    else refocusActual();
    return;
  }

  const actualCountedCash = Math.round(Number(rawVal) * 100) / 100;

  try {
    const formData = new FormData();
    formData.append("operation", "closeShift");
    formData.append(
      "json",
      JSON.stringify({
        shiftId: currentShiftId,
        actualCountedCash,
        supervisorId: pendingEosSupervisorAuth.supervisor?.user_id,
        authLogId: pendingEosSupervisorAuth.auth_log_id || pendingEosSupervisorAuth.log_id
      })
    );

    const { data } = await axios.post(apiUrl, formData, { withCredentials: true });
    const eosSummary = data.summary || data.eosReport;
    if (data.returnValue === 1 && eosSummary) {
      isSessionLockedPostEos = true;
      currentShiftId = null;
      currentEosSummary = eosSummary;
      updateShiftBadge(null, 0, true);
      await updateHeldTransactionsBadge();

      const discCount = Number(eosSummary.discarded_holds_count || 0);
      if (discCount > 0) {
        showScanFeedback(`${discCount} held sale(s) were discarded at shift end.`);
      }

      // Transition EOS modal to Phase B (Locked Session + Printable Official EOS Report)
      document.getElementById("eos-count-phase")?.classList.add("d-none");
      document.getElementById("eos-locked-report-phase")?.classList.remove("d-none");
      document.getElementById("btn-close-eos-modal")?.classList.add("d-none");

      const holdNotice = document.getElementById("eos-holds-discarded-notice");
      if (holdNotice) {
        if (discCount > 0) {
          holdNotice.textContent = `${discCount} held sale(s) were discarded at shift end.`;
          holdNotice.classList.remove("d-none");
        } else {
          holdNotice.classList.add("d-none");
        }
      }

      const reportContainer = document.getElementById("eos-printable-container");
      if (reportContainer) {
        reportContainer.innerHTML = renderEosReportSlipHtml(eosSummary, false);
      }

      const printBtn = document.getElementById("btn-print-eos-report");
      setTimeout(() => {
        if (printBtn) {
          setSpatialFocus(printBtn);
          printBtn.focus();
        }
      }, 100);
    } else {
      const alert = showError(data.message || "Failed to close shift.", "EOS Error", { returnFocus: false });
      if (alert?.then) alert.then(refocusActual);
      else refocusActual();
    }
  } catch (err) {
    const alert = showError(err.response?.data?.message || err.message || "Error closing shift.", "EOS Error", { returnFocus: false });
    if (alert?.then) alert.then(refocusActual);
    else refocusActual();
  }
};

const renderEosReportSlipHtml = (summary = currentEosSummary || {}, isReprint = false) => {
  const fmt = (val) => `₱${Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const variance = Math.round(Number(summary.variance_amount || 0) * 100) / 100;
  const varianceLabel = Math.abs(variance) < 0.005
    ? "BALANCED (₱0.00)"
    : (variance > 0 ? `OVER (+${fmt(variance)})` : `SHORT (-${fmt(Math.abs(variance))})`);
  const varianceColor = Math.abs(variance) < 0.005 ? "#198754" : (variance > 0 ? "#0d6efd" : "#dc3545");

  return `
    <div id="reprint-slip-content" class="pos-receipt-slip font-monospace" style="max-width: 420px; margin: auto;">
      <div class="text-center mb-2">
        <div class="fw-bold fs-6">END-OF-SHIFT (EOS) RECONCILIATION REPORT</div>
        <div class="small text-muted">POS &amp; AR Master Files System</div>
        <div class="small fw-bold text-uppercase">${isReprint ? "*** REPRINT / ARCHIVE COPY ***" : "*** OFFICIAL SHIFT CLOSING SLIP ***"}</div>
      </div>
      <hr class="my-2" />
      <div class="small mb-2">
        <div><strong>Shift #:</strong> ${escapeHtml(summary.shift_id)}</div>
        <div><strong>Terminal:</strong> ${escapeHtml(summary.terminal_name || "Terminal")}</div>
        <div><strong>Cashier:</strong> ${escapeHtml(summary.cashier_name || "Cashier")}</div>
        <div><strong>Opened At:</strong> ${escapeHtml(summary.opened_at || "")}</div>
        <div><strong>Closed At:</strong> ${escapeHtml(summary.closed_at || "")}</div>
        <div><strong>Verified By:</strong> ${escapeHtml(summary.supervisor_name || "Supervisor")}</div>
      </div>
      <hr class="my-2" />
      <div class="small fw-bold text-uppercase mb-1">1. Starting Balance &amp; Float</div>
      <div class="d-flex justify-content-between small">
        <span>Starting Balance (Opening Float):</span>
        <span class="fw-bold">${fmt(summary.starting_balance)}</span>
      </div>
      <div class="d-flex justify-content-between small">
        <span>Mid-Shift Float Additions (F6):</span>
        <span>+${fmt(summary.floats_added_total)}</span>
      </div>
      <div class="d-flex justify-content-between small fw-bold border-top pt-1 mt-1">
        <span>Current Float:</span>
        <span>${fmt(summary.current_float)}</span>
      </div>
      <hr class="my-2" />
      <div class="small fw-bold text-uppercase mb-1">2. Expected Cash in Hand Breakdown</div>
      <div class="d-flex justify-content-between small">
        <span>Opening Float:</span>
        <span>+${fmt(summary.starting_balance)}</span>
      </div>
      <div class="d-flex justify-content-between small">
        <span>Mid-Shift Floats Added:</span>
        <span>+${fmt(summary.floats_added_total)}</span>
      </div>
      <div class="d-flex justify-content-between small">
        <span>Cash Sales (${Number(summary.cash_sales_count || 0)} txns):</span>
        <span>+${fmt(summary.cash_sales_total)}</span>
      </div>
      <div class="d-flex justify-content-between small">
        <span>Refunds / Returns:</span>
        <span>-${fmt(summary.refunds_total)}</span>
      </div>
      <div class="d-flex justify-content-between small">
        <span>Cash Lifts / Drops (F7):</span>
        <span>-${fmt(summary.lifts_total)}</span>
      </div>
      <div class="d-flex justify-content-between fw-bold border-top pt-1 mt-1 small">
        <span>EXPECTED CASH IN HAND:</span>
        <span>${fmt(summary.expected_cash_in_hand)}</span>
      </div>
      <hr class="my-2" />
      <div class="small fw-bold text-uppercase mb-1">3. Total Posted to AR (Utang) &amp; Memos This Shift</div>
      <div class="d-flex justify-content-between small">
        <span>AR Credit Transactions Count:</span>
        <span class="fw-bold">${Number(summary.ar_sales_count || 0)}</span>
      </div>
      <div class="d-flex justify-content-between small">
        <span>Total Posted to AR (Utang) Sum:</span>
        <span class="fw-bold">${fmt(summary.ar_sales_total)}</span>
      </div>
      <div class="d-flex justify-content-between small text-success">
        <span>Credit Memos (${Number(summary.credit_memos_count || 0)}):</span>
        <span>-${fmt(summary.credit_memos_total)}</span>
      </div>
      <div class="d-flex justify-content-between small text-danger">
        <span>Debit Memos (${Number(summary.debit_memos_count || 0)}):</span>
        <span>+${fmt(summary.debit_memos_total)}</span>
      </div>
      <div class="d-flex justify-content-between small fw-bold border-top pt-1 mt-1">
        <span>Net AR Balance Posted This Shift:</span>
        <span>${fmt(summary.net_ar_posted_total !== undefined ? summary.net_ar_posted_total : (Number(summary.ar_sales_total || 0) + Number(summary.debit_memos_total || 0) - Number(summary.credit_memos_total || 0)))}</span>
      </div>
      <hr class="my-2" />
      <div class="small fw-bold text-uppercase mb-1">4. Cash Count &amp; Variance (Over / Short)</div>
      <div class="d-flex justify-content-between small">
        <span>Expected Cash in Hand:</span>
        <span>${fmt(summary.expected_cash_in_hand)}</span>
      </div>
      <div class="d-flex justify-content-between small fw-bold">
        <span>Actual Counted Cash:</span>
        <span>${fmt(summary.actual_counted_cash)}</span>
      </div>
      <div class="p-2 mt-2 border text-center fw-bold" style="color: ${varianceColor}; border-color: ${varianceColor} !important;">
        VARIANCE: ${varianceLabel}
      </div>
      ${Number(summary.discarded_holds_count || 0) > 0 ? `
      <hr class="my-2" />
      <div class="small fw-bold text-uppercase mb-1 text-danger">5. Held Sales Auto-Discarded</div>
      <div class="small text-danger fw-bold">
        ${Number(summary.discarded_holds_count)} held sale(s) were discarded at shift end.
      </div>` : `
      <hr class="my-2" />
      <div class="d-flex justify-content-between small text-muted">
        <span>Held Sales Discarded:</span>
        <span>0</span>
      </div>`}
      <div class="text-center mt-3 small text-muted">
        --- END OF EOS REPORT ---
      </div>
    </div>
  `;
};

const printActiveEosReport = () => {
  const reportEl = document.querySelector("#eos-printable-container #reprint-slip-content") || document.getElementById("eos-printable-container");
  if (!reportEl) return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Print popup blocked by browser — allow popups to print.", "warning");
    return;
  }
  printWindow.document.write(`
    <html>
      <head>
        <title>End of Shift Report</title>
        <style>
          body { font-family: "Courier New", Courier, monospace; padding: 20px; }
          .pos-receipt-slip { max-width: 420px; margin: auto; }
          hr { border-top: 1px dashed #64748b; }
          .text-end { text-align: right; }
          .text-center { text-align: center; }
          .fw-bold { font-weight: bold; }
          .d-flex { display: flex; justify-content: space-between; }
          .border-top { border-top: 1px solid #334155; }
          .border { border: 2px solid #334155; padding: 8px; margin-top: 8px; }
        </style>
      </head>
      <body>
        ${reportEl.outerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
};

const exitPostEosSession = async () => {
  isAbandoningShiftSession = true;
  await logoutUser();
};

let currentShiftFloat = 0;

const updateShiftBadge = (shiftId, floatAmount, isLocked = false) => {
  const shiftBadge = document.getElementById("pos-shift-badge");
  if (shiftBadge) {
    if (isLocked) {
      shiftBadge.textContent = "SHIFT CLOSED (LOCKED)";
      shiftBadge.className = "badge bg-danger text-white border-0 px-2 py-1 fw-bold";
      shiftBadge.title = "Shift closed and session locked";
      shiftBadge.classList.remove("d-none");
    } else if (shiftId) {
      const num = Number(floatAmount || 0);
      currentShiftFloat = num;
      shiftBadge.textContent = `SHIFT #${shiftId} (FLOAT: ₱${num.toFixed(2)})`;
      shiftBadge.className = "badge bg-info text-dark border-0 px-2 py-1 fw-bold cursor-pointer";
      shiftBadge.title = "Click or press Alt+E to reconcile & close shift (EOS)";
      shiftBadge.classList.remove("d-none");
    } else {
      currentShiftFloat = 0;
      shiftBadge.textContent = "NO ACTIVE SHIFT";
      shiftBadge.className = "badge bg-warning text-dark border-0 px-2 py-1 fw-bold cursor-pointer";
      shiftBadge.title = "Click to open shift with beginning cash";
      shiftBadge.classList.remove("d-none");
    }
  }
};

/* ==========================================================================
   Revisions: Cash Drawer Events (Float & Lift Consolidated on F7)
   ========================================================================== */
const setDrawerEventType = (type) => {
  activeDrawerEventType = type === "lift" ? "lift" : "float";
  const badge = document.getElementById("drawer-event-badge");
  const amountInput = document.getElementById("drawer-event-amount");
  const notesInput = document.getElementById("drawer-event-notes");
  const floatRadio = document.getElementById("drawer-type-float");
  const liftRadio = document.getElementById("drawer-type-lift");

  if (activeDrawerEventType === "float") {
    if (floatRadio) floatRadio.checked = true;
    if (badge) {
      badge.textContent = "FLOAT: ADD CHANGE FUND";
      badge.className = "badge bg-primary fs-6 px-3 py-2 fw-bold";
    }
    if (amountInput && (!amountInput.value || amountInput.value === "5000.00" || amountInput.value === "500.00" || amountInput.value === "500")) amountInput.value = "0";
    if (notesInput && (!notesInput.value || notesInput.value === "Mid-shift excess cash pickup")) notesInput.value = "Replenish change fund coins/small bills";
  } else {
    if (liftRadio) liftRadio.checked = true;
    if (badge) {
      badge.textContent = "LIFT / DROP: REMOVE EXCESS CASH";
      badge.className = "badge bg-secondary fs-6 px-3 py-2 fw-bold";
    }
    if (amountInput && (!amountInput.value || amountInput.value === "500.00" || amountInput.value === "500" || amountInput.value === "5000.00")) amountInput.value = "0";
    if (notesInput && (!notesInput.value || notesInput.value === "Replenish change fund coins/small bills")) notesInput.value = "Mid-shift excess cash pickup";
  }
};

const openDrawerEventModal = (type = "float") => {
  const amountInput = document.getElementById("drawer-event-amount");
  if (amountInput) {
    amountInput.value = "0";
  }
  setDrawerEventType(type);
  const modalEl = document.getElementById("drawer-event-modal");
  if (!modalEl) return;
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

const openFloatModal = () => openDrawerEventModal("float");
const openLiftModal = () => openDrawerEventModal("lift");

const submitDrawerEvent = async () => {
  const amountInput = document.getElementById("drawer-event-amount");
  const notesInput = document.getElementById("drawer-event-notes");
  const amount = parseFloat(amountInput?.value || "0");
  const notes = notesInput?.value.trim() || "";

  if (isNaN(amount) || amount <= 0) {
    showError("Please enter a valid positive amount.");
    amountInput?.focus();
    return;
  }

  bootstrap.Modal.getInstance(document.getElementById("drawer-event-modal"))?.hide();

  try {
    const auth = await requestSupervisorAuth(
      activeDrawerEventType === "float" ? "cash_float" : "lift",
      `Amount: ₱${amount.toFixed(2)}${notes ? " - " + notes : ""}`
    );

    const formData = new FormData();
    formData.append("operation", "recordDrawerEvent");
    formData.append(
      "json",
      JSON.stringify({
        shiftId: currentShiftId,
        eventType: activeDrawerEventType,
        amount: amount,
        authorizedBy: auth.supervisor?.user_id,
        notes: notes
      })
    );

    const { data } = await axios.post(apiUrl, formData, { withCredentials: true });
    if (data.returnValue === 1) {
      showScanFeedback(
        `Recorded ${activeDrawerEventType.toUpperCase()}: ₱${amount.toFixed(2)} (Authorized by ${auth.supervisor?.name || "Supervisor"}).`
      );

      // Immediately update Shift Badge with new Float amount without requiring a page refresh
      const updatedFloat = data.currentFloat !== undefined
        ? Number(data.currentFloat)
        : (data.summary?.current_float !== undefined ? Number(data.summary.current_float) : null);

      if (updatedFloat !== null && currentShiftId) {
        updateShiftBadge(currentShiftId, updatedFloat);
      }

      if (data.summary) {
        currentEosSummary = data.summary;
      }
    }
  } catch (err) {
    if (err.message && err.message !== "Cancelled") {
      showError(err.response?.data?.message || err.message);
    }
  }
  focusBarcodeInput();
};

/* ==========================================================================
   Fullscreen Toggle [F11]
   ========================================================================== */
const toggleFullscreen = async () => {
  if (isAnyModalOpen()) return;
  try {
    const doc = document;
    const isFull = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
    if (!isFull) {
      const el = doc.documentElement;
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        await el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        await el.msRequestFullscreen();
      }
    } else {
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        await doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        await doc.msExitFullscreen();
      }
    }
  } catch (err) {
    console.warn("Fullscreen toggle non-blocking notice:", err?.message || err);
    if (typeof showScanFeedback === "function") {
      showScanFeedback("Fullscreen not permitted or unsupported by browser.");
    }
  }
};

window.posTestHooks = {
  getCurrentEosSummary: () => currentEosSummary,
  getCart: () => cart,
  setCart: (c) => { cart = c; },
  pushCart: (item) => cart.push(item),
  clearCart: () => { cart = []; },
  closeSale,
  syncSukiToggleUI,
  renderCart,
  triggerHoldTransaction,
  openResumeModal,
  initiateEndOfShift,
  confirmEndOfShift,
  renderEosReportSlipHtml,
  openProductSearchModal,
  setSaleMode,
  triggerActiveCheckout,
  refreshCreditEligibility,
  openDiscountKeyboardFlow,
  cancelDiscountKeyboardFlow,
  keyboardDropdowns,
  openKeyboardDropdownList,
  syncKeyboardDropdown,
  getCurrentSaleMode: () => currentSaleMode,
  getIsSessionLockedPostEos: () => isSessionLockedPostEos,
  setIsSessionLockedPostEos: (val) => { isSessionLockedPostEos = val; },
  requestClearCart,
  cancelClearCart,
  confirmClearCart,
  openPaymentMethodModal,
  closePaymentMethodModal,
  selectPaymentMethod,
  getAvailablePaymentMethods: () => availablePaymentMethods,
  getSelectedPaymentMethodIndex: () => selectedPaymentMethodIndex,
  openDiscountModal,
  closeDiscountModal,
  switchToDiscountIdPhase,
  switchToDiscountTypePhase,
  applyStatutoryDiscountFromModal,
  removeDiscountAndClose,
  handleNoDiscountSelection,
  showReceipt,
  closeReceiptModal,
  handleReceiptPrintClick,
  getReceiptModalButtons,
  highlightReceiptButton,
  getSelectedReceiptButtonIndex: () => selectedReceiptButtonIndex,
  selectArCustomerSuggestion,
  getArCustomers: () => arCustomers,
  openDrawerEventModal,
  setDrawerEventType,
  getCurrentShiftFloat: () => currentShiftFloat,
  updateShiftBadge,
  getDiscountState: () => ({
    phase: currentDiscountModalPhase,
    pendingType: pendingDiscountType,
    selectedIndex: selectedDiscountTypeIndex,
    currentType: document.getElementById("discount_type")?.value,
    currentId: document.getElementById("discount_id_number")?.value
  }),
  isAnyModalOpen: () => isAnyModalOpen(),
  getCurrentShiftId: () => currentShiftId,
  SALE_MODE
};

window.closeSale = closeSale;
window.syncSukiToggleUI = syncSukiToggleUI;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPosRegister);
} else {
  initPosRegister();
}
