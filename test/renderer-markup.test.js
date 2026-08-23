const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PET_STATES } = require("../src/pet-state");

const rendererRoot = path.join(__dirname, "..", "src", "renderer");

test("pet renderer markup keeps the visible stage mounted", () => {
  const html = fs.readFileSync(path.join(rendererRoot, "index.html"), "utf8");

  assert.match(html, /<title>TaskPet<\/title>/);
  assert.match(html, /<main class="stage"[^>]*>/);
  assert.match(html, /id="pet"/);
  assert.match(html, /id="sprite"/);
  assert.doesNotMatch(html, /bubble|settings/i);
});

test("renderer uses only the six TaskPet states", () => {
  const source = fs.readFileSync(path.join(rendererRoot, "renderer.js"), "utf8");
  for (const state of PET_STATES) {
    assert.match(source, new RegExp(`"${state}"`));
  }

  for (const removedState of [
    "running-right",
    "running-left",
    "waving",
    "jumping",
    "failed",
    "waiting",
    "review",
    "thinking",
    "sleeping"
  ]) {
    assert.doesNotMatch(source, new RegExp(`"${removedState}"`));
  }
  assert.match(source, /window\.taskPet/);
  assert.doesNotMatch(source, /window\.desktopPet/);
});
