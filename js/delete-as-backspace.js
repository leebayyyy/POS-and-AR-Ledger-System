const textInputTypes = new Set(["text", "search", "url", "tel", "password"]);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Delete" || event.altKey || event.ctrlKey || event.metaKey) return;

  const input = event.target;
  if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return;
  if (input.disabled || input.readOnly) return;
  if (input instanceof HTMLInputElement && !textInputTypes.has(input.type)) return;

  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  if (selectionStart === null || selectionEnd === null) return;

  event.preventDefault();

  let deleteStart = selectionStart;
  if (selectionStart === selectionEnd && selectionStart > 0) {
    deleteStart -= 1;
    const currentCodeUnit = input.value.charCodeAt(deleteStart);
    const previousCodeUnit = deleteStart > 0 ? input.value.charCodeAt(deleteStart - 1) : 0;
    if (currentCodeUnit >= 0xdc00 && currentCodeUnit <= 0xdfff &&
      previousCodeUnit >= 0xd800 && previousCodeUnit <= 0xdbff) {
      deleteStart -= 1;
    }
  }

  if (deleteStart === selectionEnd) return;

  input.setRangeText("", deleteStart, selectionEnd, "start");
  input.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "deleteContentBackward"
  }));
}, true);
