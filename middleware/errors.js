export function makeError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function errorHandler(error, _request, response, _next) {
  const status = error.status || 500;
  const message = status === 500 ? 'Something went wrong.' : error.message;
  response.status(status).json({ error: message });
}
