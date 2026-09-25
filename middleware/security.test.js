import { describe, expect, jest, test } from "@jest/globals";
import { securityMiddleware } from "./security.js";

const allowedOrigin = "http://localhost:3000";

function requestWithOrigin(origin) {
  return {
    get: (header) => (header === "origin" ? origin : undefined),
  };
}

describe("security middleware", () => {
  test("allows requests from the configured origin", () => {
    const next = jest.fn();
    const originCheck = securityMiddleware(allowedOrigin)[2];

    originCheck(requestWithOrigin(allowedOrigin), {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  test("rejects requests from another origin", () => {
    const next = jest.fn();
    const originCheck = securityMiddleware(allowedOrigin)[2];

    originCheck(requestWithOrigin("https://example.com"), {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 403,
        message: "This website is not allowed.",
      }),
    );
  });
});
