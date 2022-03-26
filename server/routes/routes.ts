import { Router } from "https://deno.land/x/oak/mod.ts";

import {
  addContact,
  deleteContact,
  getContact,
  getContacts,
  updateContact,
} from "../controllers/contactsController.ts";
import authMiddleware from "../utils/authMiddleware.ts";
import { login, signup } from "../controllers/authController.ts";

const router = new Router();
router
  // auth routes
  .post("/api/signup", signup)
  .post("/api/login", login)
  // privates routes
  .post("/api/contact", authMiddleware, addContact)
  .get("/api/contacts/:id", authMiddleware, getContacts)
  .get("/api/contact/:id", authMiddleware, getContact)
  .put("/api/contact/:id", authMiddleware, updateContact)
  .delete("/api/contact/:id", authMiddleware, deleteContact);
export default router;
