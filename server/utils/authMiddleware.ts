import { Context } from "https://deno.land/x/oak/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.4/mod.ts";
import { key } from "./jwt.ts";

/**
 * authentication
 *
 * @param {context} ctx.request.headers get the header "Authorization".
 * @param {next} next() if the JWT is valid then we continue
 * @return {error} error 401 if invalid web token or not jwt in header authorization.
 */
const authMiddleware = async (ctx: Context, next: any) => {
  const headers: Headers = ctx.request.headers;
  const authorization = headers.get("Authorization");
  if (!authorization) {
    ctx.response.status = 401;
    return;
  }
  const jwt = authorization.split(" ")[1];
  if (!jwt) {
    ctx.response.status = 401;
    return;
  }
  const keyAwait = await key;
  if (await verify(jwt, keyAwait)) {
    await next();
    return;
  }
  ctx.response.status = 401;
  ctx.response.body = { message: "Invalid jwt token" };
};

export default authMiddleware;
