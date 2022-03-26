import {
  getNumericDate,
  Header,
  Payload,
} from "https://deno.land/x/djwt@v2.4/mod.ts";

export const key = crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-512" },
  true,
  ["sign", "verify"],
);
export const payload: Payload = {
  iss: "joe",
  exp: getNumericDate(60),
};
export const header: Header = {
  alg: "HS512",
  typ: "JWT",
};
