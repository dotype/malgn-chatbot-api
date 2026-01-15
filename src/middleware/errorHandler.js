/**
 * Global error handler middleware
 */
export const errorHandler = (err, c) => {
  console.error('Error:', err);

  // Custom error handling
  if (err.name === 'ValidationError') {
    return c.json({
      error: 'Validation Error',
      message: err.message
    }, 400);
  }

  if (err.name === 'UnauthorizedError') {
    return c.json({
      error: 'Unauthorized',
      message: err.message
    }, 401);
  }

  // Default error response
  return c.json({
    error: 'Internal Server Error',
    message: err.message || 'Something went wrong'
  }, 500);
};
