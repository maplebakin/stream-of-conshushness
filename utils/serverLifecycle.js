/**
 * Stop accepting HTTP work, wait for in-flight requests to finish, and only
 * then disconnect persistence. The caller owns the outer force-shutdown
 * timeout because only the process entry point should ever terminate Node.
 */
export async function closeServerAndDatabase({ server, disconnect }) {
  let closeError = null;

  if (server?.listening) {
    try {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    } catch (error) {
      closeError = error;
    }
  }

  try {
    if (typeof disconnect === 'function') await disconnect();
  } catch (error) {
    if (!closeError) closeError = error;
  }

  if (closeError) throw closeError;
}
