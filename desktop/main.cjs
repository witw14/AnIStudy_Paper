const { app } = require("electron");
const { createConnection } = require("node:net");
const socket = createConnection({
  host: "127.0.0.1",
  port: Number(process.env.ANISTUDY_CONTROL_PORT),
});
socket.on("connect", () => {
  socket.write(
    JSON.stringify({ hello: process.env.ANISTUDY_CONTROL_TOKEN }) + "\n",
  );
  require("./notes-app.cjs")(socket, socket);
});
socket.on("error", () => app.quit());
