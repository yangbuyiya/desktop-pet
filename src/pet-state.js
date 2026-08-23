const PET_STATES = Object.freeze([
  "idle",
  "working",
  "done",
  "attention",
  "drag-left",
  "drag-right"
]);

const PET_STATE_DEFINITIONS = Object.freeze({
  idle: Object.freeze({ row: 0, label: "待机", durations: Object.freeze([280, 110, 110, 140, 140, 320]) }),
  "drag-right": Object.freeze({ row: 1, label: "向右拖拽", durations: Object.freeze([120, 120, 120, 120, 120, 120, 120, 220]) }),
  "drag-left": Object.freeze({ row: 2, label: "向左拖拽", durations: Object.freeze([120, 120, 120, 120, 120, 120, 120, 220]) }),
  attention: Object.freeze({ row: 3, label: "提醒", durations: Object.freeze([140, 140, 140, 280]) }),
  done: Object.freeze({ row: 4, label: "完成", durations: Object.freeze([140, 140, 140, 140, 280]) }),
  working: Object.freeze({ row: 7, label: "执行中", durations: Object.freeze([120, 120, 120, 120, 120, 220]) })
});

const PET_ACTIONS = Object.freeze(PET_STATES.map((state) => Object.freeze({
  state,
  ...PET_STATE_DEFINITIONS[state]
})));

function isPetState(value) {
  return typeof value === "string" && PET_STATES.includes(value);
}

function normalizePetState(value) {
  return isPetState(value) ? value : "idle";
}

function normalizeMessage(value) {
  return typeof value === "string" ? value.slice(0, 120) : "";
}

class PetStateController {
  constructor(options = {}) {
    this.now = typeof options.now === "function"
      ? options.now
      : () => new Date().toISOString();
    this.onChange = typeof options.onChange === "function"
      ? options.onChange
      : () => {};
    this.current = {
      state: normalizePetState(options.initialState),
      message: normalizeMessage(options.initialMessage),
      updatedAt: String(this.now())
    };
    this.returnAfterDrag = null;
  }

  snapshot() {
    return { ...this.current };
  }

  setState(state, options = {}) {
    if (!isPetState(state)) {
      throw new TypeError(`Unsupported pet state: ${String(state)}`);
    }

    if (state === "drag-left" || state === "drag-right") {
      return this.startDrag(state);
    }

    const next = {
      state,
      message: normalizeMessage(options.message),
      updatedAt: String(this.now())
    };

    if (this.returnAfterDrag) {
      this.returnAfterDrag = next;
      return this.snapshot();
    }

    this.current = next;
    this.onChange(this.snapshot());
    return this.snapshot();
  }

  startDrag(direction) {
    if (direction !== "drag-left" && direction !== "drag-right") {
      throw new TypeError(`Unsupported drag direction: ${String(direction)}`);
    }

    if (!this.returnAfterDrag) {
      this.returnAfterDrag = this.snapshot();
    }

    this.current = {
      state: direction,
      message: "",
      updatedAt: String(this.now())
    };
    this.onChange(this.snapshot());
    return this.snapshot();
  }

  finishDrag() {
    if (!this.returnAfterDrag) return this.snapshot();

    this.current = {
      ...this.returnAfterDrag,
      updatedAt: String(this.now())
    };
    this.returnAfterDrag = null;
    this.onChange(this.snapshot());
    return this.snapshot();
  }
}

module.exports = {
  PET_ACTIONS,
  PET_STATES,
  PET_STATE_DEFINITIONS,
  PetStateController,
  isPetState,
  normalizePetState
};
