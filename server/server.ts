import { Application, send } from "https://deno.land/x/oak/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";
import router from "./routes/routes.ts";

const app = new Application();
const PORT = 8877;

app.use(oakCors({ "origin": "http://localhost:5000" }));
//app.use(oakCors({'origin':'http://0.0.0.0:5000'}));
app.use(router.routes());
app.use(router.allowedMethods());

// router
app.use(async (context) => {
  await send(context, context.request.url.pathname, {
    root: `${Deno.cwd()}/`, 
  });
});

console.log(`Server running on PORT: ${PORT}`);
app.listen({ port: PORT });

// testing units
const server = app;
export { server };
