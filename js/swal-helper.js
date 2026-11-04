// SweetAlert2 Global Helper & Modern UI Toast / Modal System
export const showToast = (title, icon = "success") => {
  if (typeof Swal !== "undefined") {
    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      }
    });
    return Toast.fire({ icon, title });
  }
};

export const showSuccess = (message, title = "Success") => {
  if (typeof Swal !== "undefined") {
    return Swal.fire({
      icon: "success",
      title,
      text: message,
      confirmButtonColor: "#198754"
    });
  }
};

export const showError = (message, title = "Error", options = {}) => {
  if (typeof Swal !== "undefined") {
    return Swal.fire({
      icon: "error",
      title,
      text: message,
      confirmButtonColor: "#dc3545",
      ...options
    });
  }
};

export const showConfirm = async ({
  title = "Are you sure?",
  text = "",
  confirmButtonText = "Yes, Proceed",
  isDestructive = true
}) => {
  if (typeof Swal !== "undefined") {
    return await Swal.fire({
      title,
      text,
      icon: isDestructive ? "warning" : "question",
      showCancelButton: true,
      confirmButtonColor: isDestructive ? "#dc3545" : "#198754",
      cancelButtonColor: "#6c757d",
      confirmButtonText,
      cancelButtonText: "Cancel"
    });
  }
  return { isConfirmed: true };
};

// Global interceptor for native window.alert to completely eliminate native dialogs
if (typeof window !== "undefined") {
  window.alert = (msg) => {
    const message = String(msg ?? "");
    const isErr = /error|failed|invalid|exceeded|unable|denied|wrong|cannot/i.test(message);
    const isSucc = /success|saved|created|updated|restored|deactivated|approved|completed|posted/i.test(message);
    if (typeof Swal !== "undefined") {
      if (isSucc) {
        showToast(message, "success");
      } else {
        Swal.fire({
          icon: isErr ? "error" : "info",
          title: isErr ? "Notice / Error" : "Information",
          text: message,
          confirmButtonColor: isErr ? "#dc3545" : "#0d6efd"
        });
      }
    } else {
      console.warn("Alert:", message);
    }
  };
}
