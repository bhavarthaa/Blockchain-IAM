import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./app.js";

describe("HTTP foundation", () => {
  it("returns a request id and health envelope", async () => {
    const response = await request(app).get("/health").set("X-Request-Id", "test-request");
    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("test-request");
    expect(response.body.data.status).toBe("ok");
    expect(response.body.meta).toBeUndefined();
  });

  it("rejects malformed authentication payloads before database access", async () => {
    const response = await request(app).post("/api/v1/auth/nonce").send({ address: "not-an-address", chainId: 31337 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
    expect(response.body.error.requestId).toBeTruthy();
  });

  it("requires authentication on projection routes", async () => {
    const response = await request(app).get("/api/v1/identities");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates public verification subjects", async () => {
    const response = await request(app).get("/api/v1/verify/did/nope");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
  });
});
