import { db } from "../database/db.ts";

interface Contact {
  _id: { $oid: string };
  firstname: string;
  lastname: string;
  email: string;
  mobile: string;
  avatar: string;
  userId: string;
}
const contacts = db.collection<Contact>("contacts");

export { contacts };
