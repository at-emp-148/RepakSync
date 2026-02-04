import test from "node:test";
import assert from "node:assert/strict";
import { computeAppId, computeShortcutAppId } from "../src/main/steam.js";

test("computeShortcutAppId matches computeAppId for quoted exe", () => {
  const entry = {
    appname: "Test Game",
    exe: "\"C:\\\\Games\\\\Test\\\\game.exe\""
  };
  const expected = computeAppId(String(entry.appname), String(entry.exe));
  const actual = computeShortcutAppId(entry);
  assert.equal(actual, expected);
});
