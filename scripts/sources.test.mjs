import assert from "node:assert/strict";
import { test } from "node:test";
import { stripTrailingWhitespace } from "./sources.mjs";

test("strips trailing spaces and tabs while preserving line endings and interior whitespace", () => {
  const input = Buffer.from("  first \tline \t\n\t \r\nsecond\t \rthird \t\nlast\t ");
  const expected = Buffer.from("  first \tline\n\r\nsecond\rthird\nlast");
  const output = stripTrailingWhitespace(input);
  assert.deepEqual(output, expected);
  assert.deepEqual(stripTrailingWhitespace(output), expected);
});

test("preserves all other bytes, including non-ASCII text and whitespace", () => {
  const unchanged = Buffer.concat([
    Buffer.from("license ©\u00a0\u2003"),
    Buffer.from([0xff, 0x00]),
  ]);
  const input = Buffer.concat([unchanged, Buffer.from(" \t\r\n")]);
  const original = Buffer.from(input);
  assert.deepEqual(stripTrailingWhitespace(input), Buffer.concat([unchanged, Buffer.from("\r\n")]));
  assert.deepEqual(input, original);
  assert.deepEqual(stripTrailingWhitespace(Buffer.alloc(0)), Buffer.alloc(0));
});
