// Keyboard and pointer input for Jakarta Night Courier.
// Held keys give continuous throttle/turn/brake; one-shot presses are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;   // Space/Enter/Click - confirm, start, restart
export const ACTION_PAUSE = 2;     // P/Escape - pause/resume
export const ACTION_MISSION_NEXT = 4;  // Tab - next mission in select
export const ACTION_MISSION_PREV = 8;  // Shift+Tab - previous mission

const THROTTLE_UP = new Set(['ArrowUp', 'KeyW']);
const THROTTLE_DOWN = new Set(['ArrowDown', 'KeyS']);
const TURN_LEFT = new Set(['ArrowLeft', 'KeyA']);
const TURN_RIGHT = new Set(['ArrowRight', 'KeyD']);
const BRAKE_FLAPS = new Set(['Space']);  // Space also acts as brake/flaps during flight
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MISSION_NEXT = new Set(['Tab']);
const MISSION_PREV = new Set(['Tab']);  // With shift

export function createInput(target) {
  let throttleUp = false;
  let throttleDown = false;
  let turnLeft = false;
  let turnRight = false;
  let brakeFlaps = false;
  let actions = 0;
  let shiftHeld = false;

  window.addEventListener('keydown', (event) => {
    const code = event.code;

    if (THROTTLE_UP.has(code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(code)) throttleDown = true;
    else if (TURN_LEFT.has(code)) turnLeft = true;
    else if (TURN_RIGHT.has(code)) turnRight = true;
    else if (BRAKE_FLAPS.has(code)) {
      brakeFlaps = true;
      // Space is also the confirm key on menus (title, briefing, retry).
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (CONFIRM.has(code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MISSION_NEXT.has(code)) {
      if (!event.repeat) {
        if (shiftHeld) actions |= ACTION_MISSION_PREV;
        else actions |= ACTION_MISSION_NEXT;
      }
    } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
      shiftHeld = true;
    } else {
      return;
    }
    event.preventDefault();
  });

  window.addEventListener('keyup', (event) => {
    const code = event.code;

    if (THROTTLE_UP.has(code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(code)) throttleDown = false;
    else if (TURN_LEFT.has(code)) turnLeft = false;
    else if (TURN_RIGHT.has(code)) turnRight = false;
    else if (BRAKE_FLAPS.has(code)) brakeFlaps = false;
    else if (code === 'ShiftLeft' || code === 'ShiftRight') {
      shiftHeld = false;
    }
  });

  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    throttleUp = false;
    throttleDown = false;
    turnLeft = false;
    turnRight = false;
    brakeFlaps = false;
    shiftHeld = false;
  });

  // Mouse click on canvas = confirm action (for menus)
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** Throttle input: -1 (down), 0 (neutral), 1 (up). */
    throttle() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /** Turn input: -1 (left), 0 (neutral), 1 (right). */
    turn() {
      return (turnRight ? 1 : 0) - (turnLeft ? 1 : 0);
    },
    /** Brake/flaps held. */
    brake() {
      return brakeFlaps;
    },
    /** One-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}