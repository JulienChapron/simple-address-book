import * as bcrypt from "https://deno.land/x/bcrypt@v0.3.0/mod.ts";
import { create } from "https://deno.land/x/djwt@v2.4/mod.ts";
import { header, key } from "../utils/jwt.ts";
import { users } from "../models/User.ts";
import { AES } from "https://deno.land/x/god_crypto/aes.ts";

// encrypt key
const aes = new AES("nbyZK5E#PE!qsv5M", {
  //mode: "cbc",
  iv: "random 16byte iv",
});

// signup
// params: username, password
export const signup = async ({ request, response }: {
  request: any;
  response: any;
}) => {
  try {
    if (!request.hasBody) {
      response.status = 403;
      response.body = {
        error: true,
        msg: "An error has been occured",
      };
    } else {
      const body = await request.body({ type: "form-data" });
      const data = await body.value.read();
      if (!data.fields.username || !data.fields.password) {
        response.status = 403;
        response.body = {
          error: true,
          msg: "All form fields must be filled in",
        };
      } else if (await users.findOne({ username: data.fields.username })) {
        response.status = 403;
        response.body = {
          error: true,
          msg: "Username already exists",
        };
      } else {
        const user = await aes.encrypt(data.fields.username);
        data.fields.username = user.hex();
        await users.insertOne({
          username: data.fields.username,
          password: await bcrypt.hashSync(data.fields.password),
        });
        response.status = 201;
        response.body = {
          success: true,
          msg: "Successfully registered",
        };
      }
    }
  } catch (err) {
    response.status = 500;
    response.body = {
      error: true,
      msg: err.toString(),
    };
  }
};

// login||
// params: username, password
export const login = async ({ request, response }: {
  request: any;
  response: any;
}) => {
  try {
    if (!request.hasBody) {
      response.status = 403;
      response.body = {
        error: true,
        msg: "An error has been occured",
      };
    }
    const body = await request.body({ type: "form-data" });
    const data = await body.value.read();
    const userEncrypt = await aes.encrypt(data.fields.username);
    const user = await users.findOne({ username: userEncrypt.hex() });
    const keyAwait = await key;
    if (!userEncrypt.hex() || !data.fields.password) {
      response.status = 403;
      response.body = {
        error: true,
        msg: "All form fields must be filled in",
      };
    }
    if (user && await bcrypt.compareSync(data.fields.password, user.password)) {
      response.status = 200;
      response.body = {
        success: true,
        data: {
          username: user.username,
          _id: user._id,
          token: await create(header, data, keyAwait),
          isAuthenticated: true,
        },
        msg: "Successfully connected",
      };
    } else {
      response.status = 403;
      response.body = {
        error: true,
        msg: "Wrong Password or Username does not exist",
      };
    }
  } catch (err) {
    response.status = 500;
    response.body = {
      error: true,
      msg: "An error has been occured",
    };
  }
};
