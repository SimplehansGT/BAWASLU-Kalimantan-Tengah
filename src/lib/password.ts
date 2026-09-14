import "server-only";

import { randomInt } from "node:crypto";

/**
 * Alphabet with the ambiguous glyphs removed (l/1/I, O/0).
 *
 * These passwords get read aloud or copied off a screen by hand — there is no
 * email to send them through — so a character that can be misread costs a
 * support call.
 */
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** `randomInt` is the CSPRNG path; Math.random would not be acceptable here. */
export function generatePassword(length = 16): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}
