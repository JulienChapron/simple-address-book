import { superdeno } from "https://deno.land/x/superdeno@4.7.2/mod.ts";
import { server } from "./server.ts";
import router from "./routes/routes.ts";

// not connected
Deno.test("1. GET/contacts (not connected) should return 401: unauthorized", async () => {
  await superdeno(server.handle.bind(server))
    .get("/api/contacts")
    .expect(401);
});
// signup
router.post("/api/signup", (ctx: any) => {
});
// username already exist
/* Deno.test("2. POST/signup (real username/password) should be return 'token'", async () => {
    const request = superdeno(server.handle.bind(server));
    const data = new FormData();
    data.append("username", "john1234");
    data.append("password", "doe12")
    await request.post("/api/signup")
        .send(data)
        .expect(201)
        .expect({"success":true,"msg":"Successfully registered"})
}) */
Deno.test("2. POST/signup (real username/password) should be return 'token'", async () => {
  const request = superdeno(server.handle.bind(server));
  const data = new FormData();
  data.append("username", "john1234");
  data.append("password", "doe12");
  await request.post("/api/signup")
    .send(data)
    .expect(200)
    .expect({ "success": false, "msg": "Username already exists" });
});
// login
router.post("/api/login", ({ ctx }: { ctx: any }) => {
});
// username does not exist
Deno.test("2. POST/login( with fake username) should be return 'Username does not exist'", async () => {
  const request = superdeno(server.handle.bind(server));
  const data = new FormData();
  data.append("username", "no-user");
  data.append("password", "no-password");
  await request.post("/api/login")
    .send(data)
    .expect(403)
    .expect({ "error": true, "msg": "Username does not exist" });
});
// password wrong
Deno.test("3. POST/login( with wrong password) should be return 'wrong password'", async () => {
  const request = superdeno(server.handle.bind(server));
  const data = new FormData();
  data.append("username", "john1234");
  data.append("password", "no-password");
  await request.post("/api/login")
    .send(data)
    .expect(403)
    .expect({ "error": true, "msg": "Wrong Password" });
});
// successfully connected
Deno.test("3. POST/login (real username/password) should be return 'token'", async () => {
  const request = superdeno(server.handle.bind(server));
  const data = new FormData();
  data.append("username", "john1234");
  data.append("password", "doe12");
  await request.post("/api/login")
    .send(data)
    .expect(200);
});
