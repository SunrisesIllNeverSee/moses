import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("commercial surfaces name Upsilon as product and pilot", async () => {
  for (const path of ["index.html", "product.html", "pilot.html", "docs.html", "llms.txt"]) {
    const source = await read(path);
    assert.match(source, /Upsilon/, `${path} must name Upsilon`);
  }
});

test("pilot manifest locks the four product roles", async () => {
  const schema = JSON.parse(await read("docs/pilot-manifest.schema.json"));
  const roles = schema.properties.product_architecture.properties;
  assert.equal(roles.brand.const, "SignalAF");
  assert.equal(roles.governance.const, "MO§ES™");
  assert.equal(roles.product.const, "Upsilon");
  assert.equal(roles.proof_surface.const, "SigRank");
  assert.equal(schema.properties.manifest_version.const, "mos2es/pilot-manifest/0.1-draft");
});

test("EKG language carries the interpretation boundary", async () => {
  const home = await read("index.html");
  assert.match(home, /EKG for how your people process with AI/);
  assert.match(home, /does not by itself prove cognition, work quality, employee productivity, or business outcomes/);
});

test("deprecated MO§E§ typo is absent", async () => {
  for (const path of ["index.html", "pilot.html", "llms.txt"]) {
    assert.doesNotMatch(await read(path), /MO§E§/);
  }
});
