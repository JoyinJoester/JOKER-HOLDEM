export async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Fall back to selection on browsers without clipboard access. */
  }
  const previous = document.activeElement as HTMLElement | null;
  const input = document.createElement("textarea");
  input.value = text;
  input.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;";
  document.body.append(input);
  input.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    /* Manual selection remains available. */
  }
  input.remove();
  previous?.focus();
  return copied;
}
