import assert from "node:assert/strict";
import test from "node:test";
import { hidePrivatePath } from "../lib/site.js";

test("analytics paths: own meals are hidden, demo recipes and other pages are kept", () => {
  const demo = ["tuna-frittata-with-vegetables"];
  const site = "https://smartbite.example.app";
  assert.equal(hidePrivatePath(`${site}/recipes/my-secret-keto-bowl`, demo), `${site}/recipes/[own-meal]`);
  assert.equal(hidePrivatePath(`${site}/recipes/tuna-frittata-with-vegetables`, demo), `${site}/recipes/tuna-frittata-with-vegetables`);
  assert.equal(hidePrivatePath(`${site}/?tab=cart`, demo), `${site}/?tab=cart`);
  assert.equal(hidePrivatePath(`${site}/privacy`, demo), `${site}/privacy`);
});
