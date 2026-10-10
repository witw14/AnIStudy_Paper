// Playwright closes the child's stdin. Keep a test pipe open and exercise the
// exact same JSON command transport that the Node server uses in production.
const { PassThrough } = require("node:stream");
const { app } = require("electron");
process.on("uncaughtException", (error) => {
  console.error(error.stack);
  app.exit(1);
});
process.on("unhandledRejection", (error) => {
  console.error(error);
  app.exit(1);
});
const pipe = new PassThrough();
globalThis.sendNoteCommand = (command) =>
  pipe.write(JSON.stringify(command) + "\n");
require("../../desktop/notes-app.cjs")(pipe);
