import { getSession } from "./auth.js?v=20261021";
import { showToast, showSuccess, showError as showSwalError } from "./swal-helper.js";

const sukiUrl = "api/suki_card.php";
let canManageCards = false;
let sukiSortDirection = "desc";
let allSukiCardsCache = [];

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("card-form").addEventListener("submit", saveCard);
  document.getElementById("suki-search-filter")?.addEventListener("input", () => {
    renderSukiTable();
  });
  authorizeAndLoad().catch(showError);
});

const authorizeAndLoad = async () => {
  const session = await getSession();
  if (!session.authenticated || !session.user) {
    window.location.href = "login.html";
    return;
  }
  if (!["Admin", "Manager"].includes(session.user.role_name)) {
    showError({ response: { status: 403 } });
    return;
  }
  await loadCards();
};

const loadCards = async () => {
  const { data } = await axios.get(sukiUrl, {
    params: { operation: "getData" },
    withCredentials: true,
  });
  canManageCards = data.canManageCards;
  document.getElementById("btn-add-card").classList.toggle("d-none", !canManageCards);
  document.getElementById("card-form").classList.toggle("d-none", !canManageCards);
  if (canManageCards) {
    document.getElementById("customer_id").innerHTML =
      '<option value="">-- SELECT CUSTOMER --</option>' +
      data.customers.map((customer) =>
        `<option value="${customer.ar_customer_id}">${customer.customer_name}</option>`).join("");
    const cardInput = document.getElementById("card_number");
    if (cardInput && data.nextCardNumber) {
      cardInput.value = data.nextCardNumber;
      cardInput.readOnly = true;
    }
  }

  allSukiCardsCache = Array.isArray(data.cards) ? data.cards : [];
  renderSukiTable();
};

const renderSukiTable = () => {
  const q = (document.getElementById("suki-search-filter")?.value || "").toLowerCase().trim();
  const filtered = !q
    ? allSukiCardsCache
    : allSukiCardsCache.filter((c) =>
        String(c.sku_card_id || "").toLowerCase().includes(q) ||
        String(c.card_number || "").toLowerCase().includes(q) ||
        String(c.customer_name || "").toLowerCase().includes(q)
      );
  const sortedCards = [...filtered].sort((a, b) => {
    const idA = Number(a.sku_card_id || 0);
    const idB = Number(b.sku_card_id || 0);
    return sukiSortDirection === "desc" ? idB - idA : idA - idB;
  });

  document.getElementById("cards").innerHTML = sortedCards.length
    ? `<div class="table-responsive"><table class="table table-striped table-sm">
        <thead><tr>
          <th id="th-suki-id" style="cursor: pointer; user-select: none;" title="Click to sort by Suki ID">
            SUKI ID <span class="sort-icon">${sukiSortDirection === "desc" ? "▼" : "▲"}</span>
          </th>
          <th>Card</th><th>Customer</th><th>Issue Date</th><th>Expiry</th><th>Points</th>
          <th>Sales</th><th>Sales Total</th><th>Last Sale</th><th>Status</th>${canManageCards ? "<th>Action</th>" : ""}
        </tr></thead>
        <tbody>${sortedCards.map((card) => `
          <tr>
            <td class="font-monospace fw-bold">#${card.sku_card_id}</td>
            <td>${card.card_number}</td><td>${card.customer_name}</td>
            <td>${card.issued_date || ""}</td><td>${card.expiry_date || ""}</td>
            <td>${Number(card.points_balance || 0).toFixed(0)}</td>
            <td>${card.sale_count}</td><td>₱${Number(card.sales_total || 0).toFixed(2)}</td>
            <td>${card.last_sale_date || ""}</td><td>${card.is_active == 1 ? "Active" : "Inactive"}</td>
            ${canManageCards ? `<td><button class="btn btn-sm btn-outline-secondary" data-id="${card.sku_card_id}" data-active="${card.is_active}">${card.is_active == 1 ? "Deactivate" : "Activate"}</button></td>` : ""}
          </tr>`).join("")}</tbody></table></div>`
    : '<p class="text-muted">No SUKI cards registered.</p>';

  document.getElementById("th-suki-id")?.addEventListener("click", () => {
    sukiSortDirection = sukiSortDirection === "desc" ? "asc" : "desc";
    loadCards();
  });

  document.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () =>
      runAction(() => toggle(button.dataset.id, button.dataset.active == 1)));
  });
};

const saveCard = async (event) => {
  event.preventDefault();
  const formData = new FormData();
  formData.append("operation", "insert");
  formData.append("json", JSON.stringify({
    customerId: document.getElementById("customer_id").value,
    cardNumber: document.getElementById("card_number").value,
    issuedDate: document.getElementById("issued_date").value,
    expiryDate: document.getElementById("expiry_date").value,
  }));
  await runAction(async () => {
    await axios.post(sukiUrl, formData, { withCredentials: true });
    event.target.reset();
    bootstrap.Modal.getInstance(document.getElementById("card-modal"))?.hide();
    await loadCards();
    showToast("SUKI card registered successfully!", "success");
  });
};

const toggle = async (id, active) => {
  const formData = new FormData();
  formData.append("operation", "setActive");
  formData.append("json", JSON.stringify({ id, active: active ? 0 : 1 }));
  await axios.post(sukiUrl, formData, { withCredentials: true });
  await loadCards();
};

const runAction = async (action) => {
  try {
    await action();
  } catch (error) {
    showError(error);
  }
};

const showError = (error) => {
  console.error(error);
  const message = error.response?.status === 403
    ? "SUKI card access is limited to Admin and Manager accounts. Your current role cannot access these records."
    : error.response?.data?.message || "Unable to load or update SUKI cards.";
  document.getElementById("suki-error").textContent = message;
  document.getElementById("suki-error").classList.remove("d-none");
  document.getElementById("btn-add-card").classList.add("d-none");
  document.getElementById("card-form").classList.add("d-none");
};
