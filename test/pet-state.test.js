const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PET_ACTIONS,
  PET_STATES,
  PetStateController,
  normalizePetState
} = require("../src/pet-state");

test("TaskPet exposes exactly six pet states", () => {
  assert.deepEqual(PET_STATES, [
    "idle",
    "working",
    "done",
    "attention",
    "drag-left",
    "drag-right"
  ]);
  assert.deepEqual(PET_ACTIONS.map(({ state, row }) => [state, row]), [
    ["idle", 0],
    ["working", 7],
    ["done", 4],
    ["attention", 3],
    ["drag-left", 2],
    ["drag-right", 1]
  ]);
  assert.equal(normalizePetState("running"), "idle");
});

test("drag states restore the state that was active before dragging", () => {
  let tick = 0;
  const changes = [];
  const controller = new PetStateController({
    now: () => `tick-${++tick}`,
    onChange: (snapshot) => changes.push(snapshot)
  });

  controller.setState("working", { message: "正在执行" });
  controller.startDrag("drag-right");
  assert.equal(controller.snapshot().state, "drag-right");

  controller.startDrag("drag-left");
  controller.setState("done", { message: "已完成" });
  assert.equal(controller.snapshot().state, "drag-left");

  const restored = controller.finishDrag();
  assert.equal(restored.state, "done");
  assert.equal(restored.message, "已完成");
  assert.deepEqual(changes.map((change) => change.state), [
    "working",
    "drag-right",
    "drag-left",
    "done"
  ]);
});

test("PetStateController rejects states outside the P0 model", () => {
  const controller = new PetStateController();
  assert.throws(() => controller.setState("review"), /Unsupported pet state/);
  assert.throws(() => controller.startDrag("left"), /Unsupported drag direction/);
});
