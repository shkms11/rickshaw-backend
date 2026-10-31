/** Load environment settings and start the Express app on the configured port. */
import "dotenv/config";

import app from "./app.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Rickshaw API running on http://localhost:${PORT}`);
});
