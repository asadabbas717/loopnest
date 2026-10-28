export type ScrollPosition = { offset: number; atEnd: boolean };

// Layout/keyboard events are observations, not a request to follow new messages.
// Only user gestures or an explicit jump change that intent. Loading/blurred
// layouts and callbacks from an older measurement cannot replace a bookmark.
export function createScrollIntent(options: {
  startAtEnd: boolean;
  scrollTo: (offset: number) => void;
  save: (position: ScrollPosition) => void;
}) {
  let active = false,
    ready = false,
    measured = false,
    restoring = true;
  let interacting = false,
    keyboard = false,
    generation = 0;
  let height = 0,
    viewport = 0,
    actual = 0;
  let waiting: number | null = null;
  let position: ScrollPosition = { offset: 0, atEnd: options.startAtEnd };
  let scrollTo = options.scrollTo;
  const max = () => Math.max(0, height - viewport);
  const save = () => options.save({ ...position });
  function apply() {
    if (!active || !ready || !measured || viewport <= 0 || interacting || keyboard) return;
    if (!restoring && !position.atEnd) return;
    const target = Math.max(0, Math.min(max(), position.atEnd ? max() : position.offset));
    restoring = false;
    position.offset = target;
    waiting = null;
    if (Math.abs(target - actual) > 1) {
      waiting = target;
      scrollTo(target);
    }
    save();
  }
  return {
    setScrollTo(action: (offset: number) => void) {
      scrollTo = action;
    },
    focus(saved?: ScrollPosition) {
      active = true;
      restoring = true;
      measured = false;
      interacting = false;
      waiting = null;
      position =
        saved && Number.isFinite(saved.offset) && typeof saved.atEnd === 'boolean'
          ? { offset: Math.max(0, saved.offset), atEnd: saved.atEnd }
          : { offset: 0, atEnd: options.startAtEnd };
      return ++generation;
    },
    blur() {
      active = false;
      measured = false;
      waiting = null;
      generation++;
    },
    ready(value: boolean) {
      if (ready !== value || !value) {
        ready = value;
        measured = false;
        restoring = true;
        waiting = null;
        generation++;
      }
    },
    ticket: () => generation,
    layout(contentHeight: number, ticket: number) {
      if (!active || !ready || ticket !== generation || !Number.isFinite(contentHeight)) return;
      height = Math.max(0, contentHeight);
      measured = true;
      apply();
    },
    viewport(value: number) {
      if (!Number.isFinite(value)) return;
      viewport = Math.max(0, value);
      apply();
    },
    keyboard(value: boolean) {
      keyboard = value;
    },
    isFocused: () => active,
    beginGesture() {
      interacting = true;
      waiting = null;
      restoring = false;
      position.offset = actual;
      position.atEnd = measured && options.startAtEnd && max() - actual <= 80;
    },
    endGesture() {
      interacting = false;
      if (active && ready) {
        position.offset = actual;
        save();
      }
    },
    observe(offset: number) {
      if (!Number.isFinite(offset)) return;
      actual = Math.max(0, offset);
      if (!active || !ready || !measured || restoring) return;
      if (waiting !== null) {
        if (Math.abs(actual - waiting) > 2) return;
        waiting = null;
      }
      if (keyboard && !interacting) return;
      position.offset = actual;
      if (interacting) position.atEnd = options.startAtEnd && max() - actual <= 80;
      save();
    },
    jumpToEnd() {
      position.atEnd = true;
      restoring = true;
      waiting = null;
      apply();
    },
  };
}
