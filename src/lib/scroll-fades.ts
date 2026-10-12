/**
 * Marks which edges of a scrollable box have content hidden past them
 * (`data-fade-top` / `data-fade-bottom`), which the CSS turns into a fade-out
 * at that edge as a "there's more" cue. Written straight to the DOM, not
 * state — it changes on every scroll frame and nothing else depends on it.
 */
export function syncScrollFades(el: HTMLElement) {
  el.dataset.fadeTop = String(el.scrollTop > 1);
  el.dataset.fadeBottom = String(el.scrollHeight - el.clientHeight - el.scrollTop > 1);
}
