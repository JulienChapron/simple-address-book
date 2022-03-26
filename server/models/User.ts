import { db } from "../database/db.ts";

interface User {
  _id: { $oid: string };
  username: string;
  password: string;
}
const users = db.collection<User>("users");

export { users };
