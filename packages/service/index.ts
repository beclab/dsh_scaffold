import { bootDshWeb } from "./dsh-web/boot.js";

bootDshWeb().catch((err) => {
  console.error(err);
  process.exit(1);
});
