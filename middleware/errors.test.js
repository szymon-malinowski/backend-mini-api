import { describe, expect, jest, test } from "@jest/globals";
import { errorHandler, makeError } from "./errors.js";

function responseMock() {
  return {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

describe("error handler", () => {
  test("returns a public message for unexpected errors", () => {
    const response = responseMock();

    errorHandler(new Error("database password"), {}, response, {});

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: "Something went wrong.",
    });
  });

  test("returns the status and message for known API errors", () => {
    const response = responseMock();

    errorHandler(makeError(404, "Post not found."), {}, response, {});

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ error: "Post not found." });
  });
});
