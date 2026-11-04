const settingsUrl = "api/settings.php";
let settingsData = { promotions: [], paymentMethods: [], products: [], productPromos: [] };
const selectedProductIds = new Set();
let focusedProductIndex = -1;

document.addEventListener("DOMContentLoaded", () => {
  const get = (id) => document.getElementById(id)?.value || "";

  document.getElementById("promotion-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runAction(() => save("insertPromotion", {
      promoName: get("promo_name"),
      description: get("promo_description"),
      startDate: get("start_date"),
      endDate: get("end_date"),
      discountRate: get("discount_rate"),
    }, event.target));
  });

  document.getElementById("method-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runAction(() => save("insertPaymentMethod", {
      methodName: get("method_name"),
      description: get("method_description"),
    }, event.target));
  });

  // Legacy single assignment form fallback (if present)
  document.getElementById("assignment-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runAction(async () => {
      await post("assignPromotion", {
        productId: get("assignment_product"),
        promoId: get("assignment_promo"),
      });
      event.target.reset();
      await load();
    });
  });

  // Bulk Promotion Assignment Controls
  document.getElementById("promo-product-search")?.addEventListener("input", () => {
    renderPromoProductsList();
  });

  document.getElementById("promo-product-search")?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.target.value = "";
      renderPromoProductsList();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusFirstVisibleProduct();
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeBulkAssignment();
    }
  });

  document.getElementById("btn-select-filtered")?.addEventListener("click", () => {
    const visible = getVisibleProducts();
    visible.forEach((p) => selectedProductIds.add(Number(p.product_id)));
    updateProductCheckboxes();
  });

  document.getElementById("btn-select-all")?.addEventListener("click", () => {
    (settingsData.products || []).forEach((p) => selectedProductIds.add(Number(p.product_id)));
    updateProductCheckboxes();
  });

  document.getElementById("btn-select-none")?.addEventListener("click", () => {
    selectedProductIds.clear();
    updateProductCheckboxes();
  });

  document.getElementById("btn-bulk-assign")?.addEventListener("click", () => {
    executeBulkAssignment();
  });

  // Keyboard navigation on the product list container
  const container = document.getElementById("promo-product-list-container");
  if (container) {
    container.addEventListener("keydown", handleProductListKeydown);
  }

  runAction(load);
});

const runAction = async (action) => {
  const errorDiv = document.getElementById("settings-error");
  if (errorDiv) {
    errorDiv.classList.add("d-none");
    errorDiv.textContent = "";
  }
  try {
    await action();
  } catch (error) {
    console.error(error);
    if (errorDiv) {
      errorDiv.textContent = error.response?.data?.message || "Unable to update system settings.";
      errorDiv.classList.remove("d-none");
    }
  }
};

const load = async () => {
  const response = await axios.get(settingsUrl, {
    params: { operation: "getSettings" },
    withCredentials: true,
  });
  settingsData = response.data || { promotions: [], paymentMethods: [], products: [], productPromos: [] };
  render();
};

const save = async (operation, data, form) => {
  await post(operation, data);
  await load();
  if (form) form.reset();
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const toggle = async (type, id, active) => {
  await post("setActive", { type, id, active: active ? 0 : 1 });
  await load();
};

const post = async (operation, data) => {
  const formData = new FormData();
  formData.append("operation", operation);
  formData.append("json", JSON.stringify(data));
  const res = await axios.post(settingsUrl, formData, { withCredentials: true });
  return res.data;
};

const getVisibleProducts = () => {
  const query = (document.getElementById("promo-product-search")?.value || "").toLowerCase().trim();
  const allProducts = settingsData.products || [];
  if (!query) return allProducts;
  return allProducts.filter((p) =>
    String(p.product_id).includes(query) ||
    String(p.product_name || "").toLowerCase().includes(query)
  );
};

const updateProductCheckboxes = () => {
  const countEl = document.getElementById("selected-products-count");
  if (countEl) {
    countEl.textContent = `${selectedProductIds.size} product${selectedProductIds.size === 1 ? "" : "s"} selected`;
  }
  document.querySelectorAll(".promo-product-checkbox").forEach((cb) => {
    const pid = Number(cb.dataset.id);
    cb.checked = selectedProductIds.has(pid);
    const row = cb.closest(".promo-product-row");
    if (row) {
      row.classList.toggle("bg-primary-subtle", selectedProductIds.has(pid));
    }
  });
};

const renderPromoProductsList = () => {
  const listEl = document.getElementById("promo-product-list");
  if (!listEl) return;
  const visible = getVisibleProducts();

  if (!visible.length) {
    listEl.innerHTML = `<div class="col-12 text-center text-muted py-3 small fst-italic">No products match your filter.</div>`;
    return;
  }

  listEl.innerHTML = visible.map((p, idx) => {
    const isSelected = selectedProductIds.has(Number(p.product_id));
    return `
      <div class="col-12 col-md-6 col-lg-4">
        <label class="promo-product-row border rounded p-2 d-flex align-items-center gap-2 cursor-pointer w-100 ${isSelected ? "bg-primary-subtle border-primary" : "bg-light"}"
               data-id="${p.product_id}" data-index="${idx}" tabindex="-1">
          <input type="checkbox" class="form-check-input promo-product-checkbox m-0 fs-6 cursor-pointer"
                 data-id="${p.product_id}" ${isSelected ? "checked" : ""} />
          <div class="small text-truncate flex-grow-1">
            <span class="fw-bold">${escapeHtml(p.product_name)}</span>
            <span class="badge bg-secondary ms-1">#${p.product_id}</span>
          </div>
        </label>
      </div>
    `;
  }).join("");

  // Attach click & change listeners
  listEl.querySelectorAll(".promo-product-checkbox").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const pid = Number(e.target.dataset.id);
      if (e.target.checked) selectedProductIds.add(pid);
      else selectedProductIds.delete(pid);
      updateProductCheckboxes();
    });
  });

  updateProductCheckboxes();
};

const focusFirstVisibleProduct = () => {
  const rows = document.querySelectorAll(".promo-product-row");
  if (rows.length > 0) {
    focusedProductIndex = 0;
    highlightProductRow(rows[0]);
    rows[0].focus();
  }
};

const highlightProductRow = (row) => {
  document.querySelectorAll(".promo-product-row").forEach((r) => r.classList.remove("border-dark", "shadow-sm"));
  if (row) {
    row.classList.add("border-dark", "shadow-sm");
    row.focus();
    row.scrollIntoView({ block: "nearest" });
  }
};

const handleProductListKeydown = (e) => {
  const rows = Array.from(document.querySelectorAll(".promo-product-row"));
  if (!rows.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusedProductIndex = (focusedProductIndex + 1) % rows.length;
    highlightProductRow(rows[focusedProductIndex]);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    focusedProductIndex = (focusedProductIndex - 1 + rows.length) % rows.length;
    highlightProductRow(rows[focusedProductIndex]);
  } else if (e.key === " ") {
    e.preventDefault();
    if (focusedProductIndex >= 0 && focusedProductIndex < rows.length) {
      const cb = rows[focusedProductIndex].querySelector(".promo-product-checkbox");
      if (cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    executeBulkAssignment();
  } else if (e.key === "Escape") {
    e.preventDefault();
    const search = document.getElementById("promo-product-search");
    if (search) {
      search.value = "";
      search.focus();
      renderPromoProductsList();
    }
  }
};

const executeBulkAssignment = () => {
  const promoId = document.getElementById("assignment_promo")?.value;
  const alertEl = document.getElementById("assignment-alert");

  if (!promoId) {
    runAction(async () => {
      throw new Error("Please select a target promotion first.");
    });
    document.getElementById("assignment_promo")?.focus();
    return;
  }

  if (selectedProductIds.size === 0) {
    runAction(async () => {
      throw new Error("Please select at least one product to assign.");
    });
    return;
  }

  runAction(async () => {
    const res = await post("assignPromotion", {
      promoId: Number(promoId),
      productIds: Array.from(selectedProductIds)
    });

    const promoEl = document.getElementById("assignment_promo");
    const promoName = promoEl ? promoEl.options[promoEl.selectedIndex]?.text : "promotion";

    if (alertEl) {
      alertEl.textContent = `${res.assignedCount || selectedProductIds.size} products assigned to ${res.promoName || promoName}.`;
      alertEl.classList.remove("d-none");
      setTimeout(() => alertEl.classList.add("d-none"), 5000);
    }

    selectedProductIds.clear();
    await load();
  });
};

const render = () => {
  // Render promotions list
  document.getElementById("promotions").innerHTML = `
    <h6>Promotions</h6>
    <ul class="list-group">${(settingsData.promotions || []).map((promotion) => `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <span>${escapeHtml(promotion.promo_name)} (${promotion.discount_rate ?? 0}%)
          <small class="d-block text-muted">${promotion.start_date || "Any start"} – ${promotion.end_date || "No end"}${promotion.description ? ` · ${escapeHtml(promotion.description)}` : ""}</small>
        </span>
        <button class="btn btn-sm ${promotion.is_active == 1 ? "btn-outline-danger" : "btn-outline-success"}"
          data-promo="${promotion.promo_id}" data-active="${promotion.is_active}">
          ${promotion.is_active == 1 ? "Deactivate" : "Activate"}
        </button>
      </li>`).join("")}</ul>`;

  // Render payment methods list
  document.getElementById("methods").innerHTML = `
    <h6>Payment Methods</h6>
    <ul class="list-group">${(settingsData.paymentMethods || []).map((method) => `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <span>${escapeHtml(method.method_name)}
          <small class="d-block text-muted">${escapeHtml(method.description || "")}</small>
        </span>
        <button class="btn btn-sm ${method.is_active == 1 ? "btn-outline-danger" : "btn-outline-success"}"
          data-method="${method.payment_method_id}" data-active="${method.is_active}">
          ${method.is_active == 1 ? "Deactivate" : "Activate"}
        </button>
      </li>`).join("")}</ul>`;

  document.querySelectorAll("[data-promo]").forEach((button) => {
    button.addEventListener("click", () => runAction(() =>
      toggle("promotion", button.dataset.promo, button.dataset.active == 1)));
  });

  document.querySelectorAll("[data-method]").forEach((button) => {
    button.addEventListener("click", () => runAction(() =>
      toggle("payment_method", button.dataset.method, button.dataset.active == 1)));
  });

  // Populate target promotion dropdown
  const promoSelect = document.getElementById("assignment_promo");
  if (promoSelect) {
    const currentVal = promoSelect.value;
    promoSelect.innerHTML =
      '<option value="">-- SELECT TARGET PROMOTION --</option>' +
      (settingsData.promotions || []).map((promotion) =>
        `<option value="${promotion.promo_id}" ${String(promotion.promo_id) === String(currentVal) ? "selected" : ""}>${escapeHtml(promotion.promo_name)} (${promotion.discount_rate ?? 0}%)</option>`).join("");
  }

  // Populate legacy assignment_product dropdown if exists
  const prodSelect = document.getElementById("assignment_product");
  if (prodSelect) {
    prodSelect.innerHTML =
      '<option value="">-- SELECT PRODUCT --</option>' +
      (settingsData.products || []).map((product) =>
        `<option value="${product.product_id}">${escapeHtml(product.product_name)}</option>`).join("");
  }

  // Render multi-select products list
  renderPromoProductsList();

  // Render assigned promotions badge list
  const assignmentsEl = document.getElementById("assignments");
  if (assignmentsEl) {
    assignmentsEl.innerHTML = (settingsData.productPromos || []).length
      ? (settingsData.productPromos || []).map((assignment) =>
        `<span class="badge bg-light text-dark border p-2 mb-1 d-inline-flex align-items-center gap-2">
          <span><strong>${escapeHtml(assignment.product_name)}</strong>: <span class="text-primary">${escapeHtml(assignment.promo_name)}</span></span>
          <button type="button" class="btn-close btn-close-sm" data-assignment="${assignment.product_promo_id}" aria-label="Remove promotion assignment"></button>
        </span>`).join("")
      : `<span class="text-muted small fst-italic">No active product-to-promotion assignments yet.</span>`;
  }

  document.querySelectorAll("[data-assignment]").forEach((button) => {
    button.addEventListener("click", () => runAction(async () => {
      await post("removePromotion", { id: button.dataset.assignment });
      await load();
    }));
  });
};
