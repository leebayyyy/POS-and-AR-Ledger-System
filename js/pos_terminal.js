import { updateModal } from "./modules/pos_terminal-update.js?v=20261101";
import { deleteModal } from "./modules/pos_terminal-delete.js?v=20261021";
import { getSession } from "./auth.js?v=20261021";
import { showToast } from "./swal-helper.js";

const baseApiUrl = "api";
sessionStorage.setItem("baseAPIUrl", baseApiUrl);

let canManageTerminals = false;
let allTerminalRecords = [];

document.addEventListener("DOMContentLoaded", () => {
  const addFieldsHtml = document.getElementById("blank-main-div").innerHTML;
  document.getElementById("btn-add").addEventListener("click", () => {
    if (!canManageTerminals) return;
    document.getElementById("blank-modal-title").innerText = "Add POS Terminal";
    document.getElementById("blank-main-div").innerHTML = addFieldsHtml;
    document.getElementById("add-form").reset();
    document.getElementById("blank-modal-footer").innerHTML = `
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      <button type="submit" class="btn btn-primary" id="btn-submit" form="add-form">Submit</button>`;
  });
  document.getElementById("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    insertPosTerminal();
  });
  document.getElementById("terminal-search-filter")?.addEventListener("input", renderFilteredTerminals);
  loadPage();
});

const updateBrowserBindingBanner = () => {
  const infoEl = document.getElementById("current-browser-binding-info");
  if (!infoEl) return;
  const token = localStorage.getItem("pos_device_token") || "Default Localhost (TERM-01)";
  infoEl.textContent = `Active Browser Token: ${token}`;
};

const bindBrowserToTerminal = async (terminal) => {
  const token = terminal.device_token || terminal.machine_identifier || String(terminal.pos_terminal_id);
  localStorage.setItem("pos_device_token", token);
  document.cookie = `pos_device_token=${encodeURIComponent(token)}; path=/; max-age=31536000; SameSite=Lax`;
  document.cookie = `pos_simulated_terminal=${encodeURIComponent(String(terminal.pos_terminal_id))}; path=/; max-age=31536000; SameSite=Lax`;

  try {
    const formData = new FormData();
    formData.append("operation", "setDefaultLocalhostTerminal");
    formData.append("json", JSON.stringify({ posTerminalId: terminal.pos_terminal_id }));
    await axios.post(`${baseApiUrl}/pos_terminal.php`, formData, { withCredentials: true });
  } catch (e) {
    // Non-blocking if user is not Admin
  }

  updateBrowserBindingBanner();
  showToast(`Bound this workstation browser to ${terminal.terminal_name} [${token}]`, "success");
};

const loadPage = async () => {
  try {
    const session = await getSession();
    canManageTerminals = ["Admin", "Manager", "Supervisor"].includes(session.user?.role_name);
    document.getElementById("btn-add").classList.toggle("d-none", !canManageTerminals);
    updateBrowserBindingBanner();
    await displayRecords();
  } catch (error) {
    showError(error);
  }
};

const showError = (error) => {
  console.error(error);
  const errorDiv = document.getElementById("terminal-error");
  errorDiv.textContent = error.response?.data?.message || "Unable to load POS terminal data.";
  errorDiv.classList.remove("d-none");
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

let terminalSortDirection = "asc";

const displayRecords = async () => {
  const response = await axios.get(`${baseApiUrl}/pos_terminal.php`, {
    params: { operation: "getAllPosTerminals" },
    withCredentials: true,
  });
  allTerminalRecords = response.data || [];
  renderFilteredTerminals();
};

const renderFilteredTerminals = () => {
  const tableDiv = document.getElementById("table-div");
  const query = (document.getElementById("terminal-search-filter")?.value || "").toLowerCase().trim();
  const filtered = allTerminalRecords.filter((t) => {
    if (!query) return true;
    return (
      String(t.pos_terminal_id).toLowerCase().includes(query) ||
      String(t.terminal_name || "").toLowerCase().includes(query) ||
      String(t.machine_identifier || "").toLowerCase().includes(query) ||
      String(t.device_token || "").toLowerCase().includes(query) ||
      String(t.ip_address || "").toLowerCase().includes(query)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const idA = Number(a.pos_terminal_id || 0);
    const idB = Number(b.pos_terminal_id || 0);
    return terminalSortDirection === "desc" ? idB - idA : idA - idB;
  });

  tableDiv.innerHTML = sorted.length
    ? `<table class="table table-hover table-striped table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th id="th-terminal-id" style="cursor: pointer; user-select: none;" title="Click to sort by Terminal ID">
              TERMINAL ID <span class="sort-icon">${terminalSortDirection === "desc" ? "▼" : "▲"}</span>
            </th>
            <th>TERMINAL NAME</th>
            <th>MACHINE ID</th>
            <th>DEVICE TOKEN</th>
            <th>IP ADDRESS</th>
            <th>BOUND CASHIERS</th>
            <th>WORKSTATION ACTION</th>
          </tr>
        </thead>
        <tbody>${sorted.map((terminal) => `
          <tr>
            <td class="font-monospace fw-bold">#${terminal.pos_terminal_id}</td>
            <td class="fw-semibold">${escapeHtml(terminal.terminal_name)}</td>
            <td class="font-monospace small">${escapeHtml(terminal.machine_identifier || "—")}</td>
            <td class="font-monospace small">${escapeHtml(terminal.device_token || "—")}</td>
            <td class="font-monospace small">${escapeHtml(terminal.ip_address || "—")}</td>
            <td><span class="badge bg-info text-dark">${Number(terminal.assigned_cashiers_count || 0)} Cashier(s)</span></td>
            <td class="d-flex flex-wrap gap-1">
              <button type="button" class="btn btn-outline-primary btn-sm btn-bind-browser" data-id="${terminal.pos_terminal_id}" title="Bind this browser/workstation to ${escapeHtml(terminal.terminal_name)}">
                Bind This Browser
              </button>
              ${canManageTerminals ? `
                <button type="button" class="btn btn-success btn-sm btn-update" data-id="${terminal.pos_terminal_id}">Update</button>
                <button type="button" class="btn btn-danger btn-sm btn-delete" data-id="${terminal.pos_terminal_id}">Delete</button>
              ` : ""}
            </td>
          </tr>`).join("")}
        </tbody>
      </table>`
    : '<p class="text-muted">No matching POS terminals found.</p>';

  document.getElementById("th-terminal-id")?.addEventListener("click", () => {
    terminalSortDirection = terminalSortDirection === "desc" ? "asc" : "desc";
    renderFilteredTerminals();
  });

  tableDiv.querySelectorAll(".btn-bind-browser").forEach((button) => {
    button.addEventListener("click", () => {
      const term = allTerminalRecords.find((r) => String(r.pos_terminal_id) === String(button.dataset.id));
      if (term) bindBrowserToTerminal(term);
    });
  });

  if (canManageTerminals) {
    tableDiv.querySelectorAll(".btn-update").forEach((button) =>
      button.addEventListener("click", () =>
        updateModal(button.dataset.id, displayRecords)));
    tableDiv.querySelectorAll(".btn-delete").forEach((button) =>
      button.addEventListener("click", () =>
        deleteModal(button.dataset.id, displayRecords)));
  }
};

const insertPosTerminal = async () => {
  const formData = new FormData();
  formData.append("operation", "insertPosTerminal");
  formData.append("json", JSON.stringify({
    terminalName: document.getElementById("terminal_name")?.value || "",
    machineIdentifier: document.getElementById("machine_identifier")?.value || "",
    deviceToken: document.getElementById("device_token")?.value || "",
    ipAddress: document.getElementById("ip_address")?.value || ""
  }));
  try {
    const { data } = await axios.post(`${baseApiUrl}/pos_terminal.php`, formData, { withCredentials: true });
    if (data !== 1) throw new Error("POS terminal was not saved.");
    await displayRecords();
    document.getElementById("add-form").reset();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("blank-modal")).hide();
  } catch (error) {
    showError(error);
  }
};
