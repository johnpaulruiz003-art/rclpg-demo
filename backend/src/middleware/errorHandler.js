export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.originalUrl}`, 404));
}

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  console.error("ERROR:", err); // always log, temporarily

  res.status(statusCode).json({
    success: false,
    message,
    ...(!err.isOperational ? { debug: err.message, stack: err.stack } : {}), // temporarily always include
  });
}
