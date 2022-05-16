import { contacts } from "../models/Contact.ts";
import { Bson } from "https://deno.land/x/mongo@v0.22.0/mod.ts";
import { decode as base64Decode } from "https://deno.land/std@0.82.0/encoding/base64.ts";
import { AES } from "https://deno.land/x/god_crypto/aes.ts";
import { v4 } from "https://deno.land/std@0.95.0/uuid/mod.ts";

///// WARNING -- never show -- WARNING /////
const aes = new AES("nbyZK5E#PE!qsv5M", {
  //mode: "cbc",
  iv: "random 16byte iv",
});

// @description: ADD single contact
// @route POST /api/contacts
const addContact = async ({
  request,
  response,
}: {
  request: any;
  response: any;
}) => {
  try {
    if (!request.hasBody) {
      response.status = 400;
      response.body = {
        success: false,
        msg: "An error has been occured",
      };
    } else {
      const body = await request.body({ type: "form-data" });
      const data = await body.value.read();
      if (
        !data.fields.firstname.length || !data.fields.lastname.length ||
        !data.fields.mobile.length
      ) {
        return response.body = {
          success: false,
          msg: "All form fields must be filled in",
          type: "allfields",
        };
      }
      if (data.fields.email.length) {
        const regexEmail =
          /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        const testEmail = regexEmail.test(
          String(data.fields.email).toLowerCase(),
        );
        if (!testEmail) {
          return response.body = {
            success: false,
            msg: "Incorrect email",
            type: "email",
          };
        }
      }
      if (data.fields.avatar) {
        // encoded base64
        let imgBase64 = data.fields.avatar;
        imgBase64 = imgBase64.replace("data:image/jpeg;base64,", "").replace(
          "data:image/png;base64,",
          "",
        ).replace(" ", "+");
        const imgBase64Decoded = base64Decode(imgBase64);
        const avatarId = v4.generate();
        data.fields.avatar = `static/${avatarId}.png`;
        Deno.writeFile(`static/${avatarId}.png`, imgBase64Decoded);
      } else {
        data.fields.avatar = "static/user.jpg";
      }
      let mobile = data.fields.mobile;
      mobile = mobile.replace(/\s/g, "");
      const regexMobile = /^((\+)33|0|0033)[1-9](\d{2}){4}$/g;
      const testMobile = regexMobile.test(String(mobile));
      if (!testMobile) {
        return response.body = {
          success: false,
          msg: "Incorrect mobile number",
          type: "mobile",
        };
      } else {
        if (
          data.fields.firstname && data.fields.lastname &&
          data.fields.mobile
        ) {
          // encrypt data
          const firstname = await aes.encrypt(data.fields.firstname);
          data.fields.firstname = firstname.hex();
          const lastname = await aes.encrypt(data.fields.lastname);
          data.fields.lastname = lastname.hex();
          const email = await aes.encrypt(data.fields.email);
          data.fields.email = email.hex();
          const mobile = await aes.encrypt(data.fields.mobile);
          data.fields.mobile = mobile.hex();
          const contact = data.fields;
          await contacts.insertOne(contact);
          response.status = 201;
          response.body = {
            success: true,
            data: contact,
          };
        } else {
          response.status = 200;
          response.body = {
            success: false,
            msg: "All form fields must be filled in",
          };
        }
      }
    }
  } catch (err) {
    response.body = {
      success: false,
      msg: err.toString(),
    };
  }
};

// DESC: DELETE single contact
// METHOD: DELETE /api/contact/:id
const deleteContact = async ({
  params,
  request,
  response,
}: {
  params: { id: string };
  request: any;
  response: any;
}) => {
  try {
    const body = await request.body();
    const url = await body.value;
    await contacts.delete(
      { _id: new Bson.ObjectId(params.id) },
    );
    if (url !== "static/user.jpg") {
      await Deno.remove(url);
    }
    response.status = 200;
    response.body = {
      success: true,
      data: "this contact is deleted",
    };
  } catch (err) {
    response.body = {
      success: false,
      msg: err.toString(),
    };
  }
};

// DESC: GET single contact
// METHOD: GET /api/contact/:id
const getContact = async ({
  params,
  response,
}: {
  params: { id: string };
  response: any;
}) => {
  try {
    const getContact = await contacts.findOne(
      { _id: new Bson.ObjectId(params.id) },
    );
    response.status = 200;
    response.body = {
      success: true,
      data: getContact,
    };
  } catch (err) {
    response.body = {
      success: false,
      msg: err.toString(),
    };
  }
};

// util to convert hex to bytes array
function hexToBytesArray(hex: any) {
  const bytes = [];
  for (let c = 0; c < hex.length; c += 2) {
    bytes.push(parseInt(hex.substr(c, 2), 16));
  }
  return bytes;
}

// DESC: GET all contacts
// METHOD: GET /api/contacts
const getContacts = async ({ response, params }: {
  response: any;
  params: { id: string };
}) => {
  const getContacts = await contacts.find({ userId: params.id }).toArray();
  interface contact {
    email: any;
    lastname: any;
    firstname: any;
    mobile: any;
  }
  getContacts.forEach(async (contact: contact) => {
    const email = aes.decrypt(new Uint8Array(hexToBytesArray(contact.email)));
    const lastname = aes.decrypt(
      new Uint8Array(hexToBytesArray(contact.lastname)),
    );
    const firstname = aes.decrypt(
      new Uint8Array(hexToBytesArray(contact.firstname)),
    );
    const mobile = aes.decrypt(new Uint8Array(hexToBytesArray(contact.mobile)));
    Promise.all([email, firstname, lastname, mobile]).then((values) => {
      contact.email = values[0].toString();
      contact.firstname = values[1].toString();
      contact.lastname = values[2].toString();
      contact.mobile = values[3].toString();
    });
  });
  if (getContacts) {
    response.status = 200;
    response.body = {
      success: true,
      data: await getContacts,
    };
  } else {
    response.status = 404;
    response.body = {
      success: false,
      msg: "No contacts found",
    };
  }
};

// DESC: UPDATE single contact
// METHOD: PUT /api/contact/:id
const updateContact = async ({
  params,
  request,
  response,
}: {
  params: { id: string };
  request: any;
  response: any;
}) => {
  try {
    const body = await request.body({ type: "form-data" });
    const data = await body.value.read();
    // test fields all filled
    if (
      !data.fields.firstname.length || !data.fields.lastname.length ||
      !data.fields.mobile.length
    ) {
      return response.body = {
        success: false,
        msg: "All form fields must be filled in",
        type: "allfields",
      };
    }
    if (data.fields.email.length) {
      const regexEmail =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      const testEmail = regexEmail.test(
        String(data.fields.email).toLowerCase(),
      );
      if (!testEmail) {
        return response.body = {
          success: false,
          msg: "Incorrect email",
          error: "WARNING: Something not so bad happened",
          type: "email",
        };
      }
    }
    if (data.fields.avatar) {
      if (
        data.fields.avatar.includes("data:image/jpeg;base64") ||
        data.fields.avatar.includes("data:image/png;base64")
      ) {
        let imgBase64 = data.fields.avatar;
        imgBase64 = imgBase64.replace("data:image/jpeg;base64,", "").replace(
          "data:image/png;base64,",
          "",
        ).replace(" ", "+");
        const imgBase64Decoded = base64Decode(imgBase64);
        const avatarId = v4.generate();
        data.fields.avatar = `static/${avatarId}.png`;
        Deno.writeFile(`static/${avatarId}.png`, imgBase64Decoded);
      }
    }
    let mobile = data.fields.mobile;
    mobile = mobile.replace(/\s/g, "");
    const regexMobile = /^((\+)33|0|0033)[1-9](\d{2}){4}$/g;
    const testMobile = regexMobile.test(String(mobile));
    if (!testMobile) {
      return response.body = {
        success: false,
        msg: "Incorrect mobile number",
        type: "mobile",
      };
    } else {
      if (
        data.fields.firstname && data.fields.lastname &&
        data.fields.mobile
      ) {
        const firstname = await aes.encrypt(data.fields.firstname);
        data.fields.firstname = firstname.hex();
        const lastname = await aes.encrypt(data.fields.lastname);
        data.fields.lastname = lastname.hex();
        const email = await aes.encrypt(data.fields.email);
        data.fields.email = email.hex();
        const mobile = await aes.encrypt(data.fields.mobile);
        data.fields.mobile = mobile.hex();

        const contact = data.fields;
        await contacts.updateOne(
          { _id: new Bson.ObjectId(params.id) },
          { $set: contact },
        );

        const updatedContact = await contacts.findOne({
          _id: new Bson.ObjectId(params.id),
        });
        response.status = 200;
        response.body = {
          success: true,
          data: updatedContact,
        };
      }
    }
  } catch (err) {
    response.body = {
      success: false,
      msg: err.toString(),
    };
  }
};

export { addContact, deleteContact, getContact, getContacts, updateContact };
