import { showToast, showError } from "../swal-helper.js";

export const updateModal = async (posTerminalId, refreshDisplay) => {
  const myModal = new bootstrap.Modal(document.getElementById("blank-modal"), {
    keyboard: true,
    backdrop: "static",
  });

  document.getElementById("blank-modal-title").innerText = "Update POS Terminal & Registry";
  const record = await getPosTerminalDetails(posTerminalId);

  let myHtml = `
        <table class="table table-sm align-middle">
          <tr>
            <td>Terminal Name *</td>
            <td><input type="text" id="update-terminal_name" class="form-control" maxlength="150" value="${record.terminal_name ?? ""}" required /></td>
          </tr>
          <tr>
            <td>Machine Identifier</td>
            <td><input type="text" id="update-machine_identifier" class="form-control font-monospace" maxlength="150" value="${record.machine_identifier ?? ""}" placeholder="e.g. TERM-01" /></td>
          </tr>
          <tr>
            <td>Device Token</td>
            <td><input type="text" id="update-device_token" class="form-control font-monospace" maxlength="150" value="${record.device_token ?? ""}" placeholder="e.g. TOKEN-TERM-1" /></td>
          </tr>
          <tr>
            <td>IP Address</td>
            <td><input type="text" id="update-ip_address" class="form-control font-monospace" maxlength="64" value="${record.ip_address ?? ""}" placeholder="e.g. 127.0.0.1" /></td>
          </tr>
        </table>
    `;
  document.getElementById("blank-main-div").innerHTML = myHtml;

  const modalFooter = document.getElementById("blank-modal-footer");
  modalFooter.innerHTML = `
      <button type="button" class="btn btn-primary btn-sm w-100 btn-update">UPDATE</button>
      <button type="button" class="btn btn-secondary btn-sm w-100" data-bs-dismiss="modal">Close</button>
    `;

  modalFooter.querySelector(".btn-update").addEventListener("click", async () => {
    if (await updatePosTerminal(posTerminalId) == 1) {
      refreshDisplay();
      showToast("POS Terminal record has been successfully updated!", "success");
      myModal.hide();
    } else {
      showError("Failed to update POS terminal.");
    }
  });

  myModal.show();
};

const getPosTerminalDetails = async (posTerminalId) => {
  const params = {
    operation: "getPosTerminal",
    json: JSON.stringify({ posTerminalId: posTerminalId }),
  };
  const response = await axios.get(
    `${sessionStorage.baseAPIUrl}/pos_terminal.php`,
    { params: params }
  );
  return response.data[0];
};

const updatePosTerminal = async (posTerminalId) => {
  const jsonData = {
    terminalName: document.getElementById("update-terminal_name").value,
    machineIdentifier: document.getElementById("update-machine_identifier")?.value || "",
    deviceToken: document.getElementById("update-device_token")?.value || "",
    ipAddress: document.getElementById("update-ip_address")?.value || "",
    posTerminalId: posTerminalId,
  };
  const formData = new FormData();
  formData.append("operation", "updatePosTerminal");
  formData.append("json", JSON.stringify(jsonData));
  const response = await axios({
    url: `${sessionStorage.baseAPIUrl}/pos_terminal.php`,
    method: "POST",
    data: formData,
  });
  return response.data;
};
