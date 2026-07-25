import { describe, it, expect, vi, beforeAll } from "vitest";
import axios from "axios";

vi.stubEnv("NEXT_PUBLIC_API_URL", "http://test-gateway:9000");

let apiClient: ReturnType<typeof axios.create>;

beforeAll(async () => {
  const apiModule = await import("./api");
  apiClient = apiModule.apiClient;
});

describe("apiClient configuration", () => {
  it("sets Content-Type to application/json by default", () => {
    const contentType =
      (apiClient.defaults.headers as Record<string, string>)["Content-Type"];
    expect(contentType).toBe("application/json");
  });

  it("has a timeout of 30 seconds", () => {
    expect(apiClient.defaults.timeout).toBe(30_000);
  });

  it("injects the base URL via a request interceptor (not axios.create defaults)", () => {
    // The base URL is dynamically resolved from localStorage/env on every request
    // via a request interceptor, so defaults.baseURL is intentionally undefined.
    expect(apiClient.defaults.baseURL).toBeUndefined();
    expect(apiClient.interceptors.request.handlers?.length ?? 0).toBeGreaterThan(0);
  });

  it("registers a response interceptor for gateway error normalisation", () => {
    expect(apiClient.interceptors.response.handlers?.length ?? 0).toBeGreaterThan(0);
  });

  it("is an axios instance (not the raw axios object)", () => {
    expect(typeof apiClient.get).toBe("function");
    expect(typeof apiClient.post).toBe("function");
    expect(typeof apiClient.patch).toBe("function");
    expect(typeof apiClient.delete).toBe("function");
  });
});
