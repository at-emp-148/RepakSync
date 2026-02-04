import test from "node:test";
import assert from "node:assert/strict";
import { parseMostRecentUserId } from "../src/main/steam.js";

test("parseMostRecentUserId returns MostRecent user", () => {
  const sample = `"users"
{
  "12345678901234567"
  {
    "AccountName"  "user1"
    "MostRecent"   "0"
  }
  "76561198000000000"
  {
    "AccountName"  "user2"
    "MostRecent"   "1"
  }
}`;
  assert.equal(parseMostRecentUserId(sample), "76561198000000000");
});

test("parseMostRecentUserId returns null when missing", () => {
  const sample = `"users"
{
  "12345678901234567"
  {
    "AccountName"  "user1"
  }
}`;
  assert.equal(parseMostRecentUserId(sample), null);
});
